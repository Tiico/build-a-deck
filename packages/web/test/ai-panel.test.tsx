// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language, type Lang } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// The AI panel beside the editor's work (#1001, #940 variant A): a question about the game, the
// answer streamed into a polite live region, cancelled mid-stream, and a plain word for every way it
// can fail — with a pointer to the profile, and the editor otherwise as it was, for a designer who
// has no key. Against the real server and the fake providers behind it.
const KEY = 'sk-ant-api03-good-NotARealKey-0123456789abcdefx7Qd'
let run: Running
beforeEach(async () => {
  // Whether the panel was last left open is the reader's own, kept between visits; every test here
  // starts as a reader who has never said.
  localStorage.clear()
  run = await startServer({ auth: true, ai: true })
})
afterEach(async () => {
  await run.stop()
})

async function signIn(email = 'ada@example.com'): Promise<string> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  await fetch(`${run.http}${link}`, { redirect: 'manual' })
  return (await run.auth!.ensureAccount(email)).id
}
async function ownGame(key: string | null = KEY, doc = projectDoc()): Promise<void> {
  const account = await signIn()
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...doc }) })
  if (key) await run.ai!.vault.save(account, 'anthropic', key)
}
async function openEditor(lang: Lang = 'sv', onNavigate: (url: string) => void = () => undefined): Promise<void> {
  shown = lang === 'en' ? 'AI help' : 'AI-hjälp'
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang={lang}>
      <StatusLive>
        <EditorPage onNavigate={onNavigate} />
      </StatusLive>
    </Language>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Skogens herrar' })
}

const panel = (name = 'AI-hjälp') => screen.getByRole('complementary', { name })
const field = (name = 'Fråga om spelet') => screen.getByRole('textbox', { name }) as HTMLTextAreaElement
let shown = 'AI-hjälp'
const live = () => panel(shown).querySelectorAll<HTMLElement>('[aria-live="polite"]')
const lastAnswer = () => [...live()].at(-1)!
const type = (text: string, name?: string) => fireEvent.change(field(name), { target: { value: text } })
const enter = (name?: string) => fireEvent.keyDown(field(name), { key: 'Enter' })

describe('the AI panel with a key', () => {
  it('stands open beside the work, says what is sent to whom, and answers a question as it streams', async () => {
    await ownGame()
    await openEditor()
    const aside = await screen.findByRole('complementary', { name: 'AI-hjälp' })
    expect(within(aside).getByRole('heading', { level: 2, name: 'AI-hjälp' })).toBeTruthy()
    const sent = within(aside).getByText(/Skickas till Anthropic/).closest('p')!
    expect(sent.textContent).toMatch(/Skickas till Anthropic:.*3 kort.*mallen.*bordet/)
    // A deck inside the budget goes whole, and is not said to be summarised (#1007).
    expect(sent.textContent).not.toMatch(/sammanfattade/)
    // What is sent is said to whoever is about to write the question, too.
    expect(field().getAttribute('aria-describedby')?.split(' ')).toContain(sent.id)

    type('Vad heter spelet?')
    enter()
    // While it streams the send is the way to stop it, in the same place.
    expect(await within(aside).findByRole('button', { name: 'Avbryt' })).toBeTruthy()
    await waitFor(() => expect(lastAnswer().textContent).toBe('Du frågade: «Vad heter spelet?». Spelet heter Skogens herrar.'))
    await waitFor(() => expect(lastAnswer().getAttribute('aria-busy')).toBe('false'))
    expect(within(aside).getByRole('button', { name: 'Skicka' })).toBeTruthy()
    expect(field().value).toBe('')
    expect(within(aside).getByText('Vad heter spelet?')).toBeTruthy()
    // The question went with the conversation and the language, and nothing else.
    const call = run.ai!.fake.calls.at(-1)!
    expect(call).toMatchObject({ provider: 'anthropic', path: '/v1/messages', key: KEY })
  })

  it('draws the answer in the card text’s own subset, and never as markup', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    type('Är **draken** <b>stark</b>?')
    enter()
    await waitFor(() => expect(lastAnswer().getAttribute('aria-busy')).toBe('false'))
    expect(lastAnswer().querySelector('strong')?.textContent).toBe('draken')
    expect(lastAnswer().querySelector('b')).toBeNull()
    expect(lastAnswer().textContent).toContain('<b>stark</b>')
  })

  it('carries the conversation so far into the next question', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    type('Första?')
    enter()
    await waitFor(() => expect(lastAnswer().getAttribute('aria-busy')).toBe('false'))
    expect(lastAnswer().textContent).toMatch(/Spelet heter/)
    type('Andra?')
    enter()
    await waitFor(() => expect(live()).toHaveLength(2))
    await waitFor(() => expect(lastAnswer().textContent).toMatch(/«Andra\?»/))
    const messages = (run.ai!.fake.calls.filter((call) => call.body !== undefined).at(-1)!.body as { messages: { role: string; content: string }[] }).messages
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(messages[0]!.content).toBe('Första?')
    expect(messages[2]!.content).toBe('Andra?')
  })

  it('is used whole from the keyboard: Shift+Enter is a new line, Enter sends, Escape stops the answer and the provider with it', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    const calls = run.ai!.fake.calls.length
    enter()
    expect(run.ai!.fake.calls.length).toBe(calls)
    type('Långt svar [slow]')
    fireEvent.keyDown(field(), { key: 'Enter', shiftKey: true })
    expect(run.ai!.fake.calls.length).toBe(calls)
    field().focus()
    enter()
    await waitFor(() => expect(lastAnswer().textContent).toMatch(/^Ett/))
    expect(lastAnswer().getAttribute('aria-busy')).toBe('true')
    fireEvent.keyDown(field(), { key: 'Escape' })
    await waitFor(() => expect(panel().textContent).toMatch(/Avbrutet\./))
    await waitFor(() => expect(run.ai!.fake.streams.at(-1)!.closed).toBe(true))
    expect(run.ai!.fake.streams.at(-1)!.finished).toBe(false)
    expect(document.activeElement).toBe(field())
    expect(within(panel()).getByRole('button', { name: 'Skicka' })).toBeTruthy()
  })

  it('stops the answer from its button too', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    type('Långt svar [slow]')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Skicka' }))
    await waitFor(() => expect(lastAnswer().textContent).toMatch(/^Ett/))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(panel().textContent).toMatch(/Avbrutet\./))
    await waitFor(() => expect(run.ai!.fake.streams.at(-1)!.closed).toBe(true))
  })

  it('folds away to a narrow tab and back, handing the keys to what was opened', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Stäng AI-hjälpen' }))
    const tab = await screen.findByRole('button', { name: 'AI-hjälp' })
    expect(tab.getAttribute('aria-expanded')).toBe('false')
    await waitFor(() => expect(document.activeElement).toBe(tab))
    expect(screen.queryByRole('textbox', { name: 'Fråga om spelet' })).toBeNull()
    fireEvent.click(tab)
    await waitFor(() => expect(document.activeElement).toBe(field()))
  })
})

describe('when the provider says no', () => {
  it.each([
    ['sk-ant-bad-00000000000000', 'Hej', 'Anthropic godtog inte nyckeln', 'Byt nyckel på profilen'],
    ['sk-ant-broke-000000000000', 'Hej', 'Kontot hos Anthropic saknar kredit', null],
    ['sk-ant-busy-0000000000000', 'Hej', 'Anthropic tar inte emot fler anrop just nu', 'Försök igen'],
    ['sk-ant-swamped-0000000000', 'Hej', 'Anthropic är överbelastad just nu', 'Försök igen'],
    ['sk-ant-hangup-00000000000', 'Hej', 'Svaret från Anthropic kom inte fram', 'Försök igen'],
    [KEY, 'Elakt [refuse]', 'Anthropic ville inte svara', null],
    [KEY, 'Halvvägs [fail]', 'Anthropic är överbelastad just nu', 'Försök igen'],
  ])('with %s and «%s» it says «%s»', async (key, question, title, action) => {
    await ownGame(key)
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    type(question)
    enter()
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain(title)
    if (action === 'Försök igen') expect(within(alert).getByRole('button', { name: action })).toBeTruthy()
    if (action === 'Byt nyckel på profilen') expect(within(alert).getByRole('link', { name: action }).getAttribute('href')).toBe(`/profile?from=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  })

  it('asks again with «Försök igen»', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    type('Halvvägs [fail]')
    enter()
    const alert = await within(panel()).findByRole('alert')
    const before = run.ai!.fake.calls.length
    fireEvent.click(within(alert).getByRole('button', { name: 'Försök igen' }))
    await waitFor(() => expect(run.ai!.fake.calls.length).toBe(before + 1))
  })
})

describe('the panel’s head', () => {
  it('names the model by the name the profile gives it, not by its id', async () => {
    await ownGame()
    await openEditor()
    const who = await within(await screen.findByRole('complementary', { name: 'AI-hjälp' })).findByRole('link', { name: /Nyckel och modell/ })
    await waitFor(() => expect(who.textContent).toBe('Anthropic · Claude Sonnet 5.5'))
  })
})

// Speltema and Bord measure their surfaces to the pixel (#741, #652, #685), so there the open panel
// is a sheet over the surface's right part and takes none of its width (beställarens beslut
// 2026-10-18, #1001); everywhere else it stands beside the work.
describe('the open panel over Speltema and Bord', () => {
  it.each([
    ['theme', 'Speltema'],
    ['tables', 'Bord'],
  ])('lies over %s as a sheet, keeps the work’s width, and folds away on Escape with the keys back on the tab', async (mode) => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    expect(panel().hasAttribute('data-over')).toBe(false)
    fireEvent.click(document.getElementById(`byd-editor-tab-${mode}`)!)
    await waitFor(() => expect(panel().hasAttribute('data-over')).toBe(true))
    // What the work keeps is the folded tab's room and no more, so nothing under the sheet moves.
    expect(document.querySelector('.byd-editor > main > .byd-ai-room')).not.toBeNull()
    // The sheet comes after the work in the order the keys go, as the panel beside it does.
    const order = [...document.querySelectorAll('.byd-editor > main > *')].map((el) => el.getAttribute('role') ?? el.className)
    expect(order.indexOf('tabpanel')).toBeLessThan(order.findIndex((c) => c.includes('byd-ai')))
    field().focus()
    fireEvent.keyDown(field(), { key: 'Escape' })
    const tab = await screen.findByRole('button', { name: 'AI-hjälp' })
    await waitFor(() => expect(document.activeElement).toBe(tab))
    fireEvent.click(tab)
    await waitFor(() => expect(panel().hasAttribute('data-over')).toBe(true))
  })

  it('stands beside the work in the other tabs, where Escape belongs to the answer', async () => {
    await ownGame()
    await openEditor()
    await screen.findByRole('complementary', { name: 'AI-hjälp' })
    for (const mode of ['wall', 'table', 'template', 'rules']) {
      fireEvent.click(document.getElementById(`byd-editor-tab-${mode}`)!)
      await waitFor(() => expect(panel().hasAttribute('data-over')).toBe(false))
    }
    fireEvent.keyDown(field(), { key: 'Escape' })
    expect(screen.getByRole('complementary', { name: 'AI-hjälp' }).hasAttribute('data-open')).toBe(true)
  })
})

describe('the AI panel without a key', () => {
  it('is a narrow tab that opens onto the way to the profile, and the editor is otherwise as it was', async () => {
    await ownGame(null)
    // However it was last left: a panel with nothing to ask with never takes the work's width on its own.
    localStorage.setItem('byd.ai.panel', 'open')
    await openEditor()
    const tab = await screen.findByRole('button', { name: 'AI-hjälp' })
    expect(tab.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('textbox', { name: 'Fråga om spelet' })).toBeNull()
    fireEvent.click(tab)
    const link = await within(panel()).findByRole('link', { name: 'Lägg in en nyckel på din profil' })
    expect(link.getAttribute('href')).toBe(`/profile?from=${run.projectId}&server=${encodeURIComponent(run.http)}`)
    await waitFor(() => expect(document.activeElement).toBe(link))
    expect(screen.queryByRole('textbox', { name: 'Fråga om spelet' })).toBeNull()
  })

  it('goes to the profile the way the editor is left', async () => {
    await ownGame(null)
    const went: string[] = []
    await openEditor('sv', (url) => went.push(url))
    fireEvent.click(await screen.findByRole('button', { name: 'AI-hjälp' }))
    fireEvent.click(await within(panel()).findByRole('link', { name: 'Lägg in en nyckel på din profil' }))
    expect(went).toEqual([`/profile?from=${run.projectId}&server=${encodeURIComponent(run.http)}`])
  })
})

// A deck over the context's budget (#1007) without being a large one to render: three cards whose
// texts are long enough that the whole deck is far over what goes whole.
function heavy(): ReturnType<typeof projectDoc> {
  const doc = projectDoc()
  return { ...doc, rows: doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, body: `Kort ${i + 1}. ${'En lång regeltext som fortsätter. '.repeat(2000)}` } })) }
}

describe('the deck that is sent (#1007)', () => {
  it('says «sammanfattade» when the deck is over the budget', async () => {
    await ownGame(KEY, heavy())
    await openEditor()
    const aside = await screen.findByRole('complementary', { name: 'AI-hjälp' })
    const sent = within(aside).getByText(/Skickas till Anthropic/).closest('p')!
    expect(sent.textContent).toMatch(/Skickas till Anthropic:.*3 kort \(sammanfattade\).*mallen/)
  })
})

describe('in English', () => {
  it('speaks the reader’s language, and passes it on', async () => {
    await ownGame()
    await openEditor('en')
    const aside = await screen.findByRole('complementary', { name: 'AI help' })
    expect(within(aside).getByText(/Sent to Anthropic/).closest('p')!.textContent).toMatch(/Sent to Anthropic:.*3 cards.*the template.*the table/)
    type('What is it called?', 'Ask about the game')
    enter('Ask about the game')
    await waitFor(() => expect(lastAnswer().getAttribute('aria-busy')).toBe('false'))
    expect(lastAnswer().textContent).toMatch(/Skogens herrar/)
    expect(((run.ai!.fake.calls.filter((call) => call.body !== undefined).at(-1)!.body as { system: { text: string }[] }).system[0]!.text)).toMatch(/uses the tool in English/)
    type('Elakt [refuse]', 'Ask about the game')
    enter('Ask about the game')
    expect((await within(aside).findByRole('alert')).textContent).toContain('Anthropic would not answer')
  })

  it('says when the deck is summarised rather than sent whole (#1007)', async () => {
    await ownGame(KEY, heavy())
    await openEditor('en')
    const aside = await screen.findByRole('complementary', { name: 'AI help' })
    expect(within(aside).getByText(/Sent to Anthropic/).closest('p')!.textContent).toMatch(/Sent to Anthropic:.*3 cards \(summarised\).*the template/)
  })

  it('points to the profile in English without a key', async () => {
    await ownGame(null)
    await openEditor('en')
    fireEvent.click(await screen.findByRole('button', { name: 'AI help' }))
    expect(await within(panel('AI help')).findByRole('link', { name: 'Add a key on your profile' })).toBeTruthy()
  })
})

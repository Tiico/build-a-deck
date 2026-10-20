// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { tabId } from '../src/editor/EditorTabs.js'
import { Language, type Lang } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// Rule text as a proposal (#1006, #940 variant A): the designer asks for help with the rulebook and
// gets blocks in the book's own kinds, placed where they stand. The panel says what they are, with
// what a rule names said by its name; «Visa i regelboken» lays them in the Regler tab, drawn by the
// book's own rendering and marked as the wall marks a proposal; accepting is one composite edit and
// one step back; and a rule naming a zone the game does not have is refused with the reason. Against
// the real server and the fake providers behind it, whose `[regler]` and `[regler-trasig]` answer so.
const KEY = 'sk-ant-api03-good-NotARealKey-0123456789abcdefR3gl'
let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true, ai: true })
})
afterEach(async () => {
  await run.stop()
})

const withBook = (): ProjectDoc => ({
  ...projectDoc(),
  rules: {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'b1', level: 1, text: 'Översikt' },
      { kind: 'text', id: 'b2', text: 'Ett spel om skogen.' },
    ],
  },
})
async function ownGame(doc: ProjectDoc = withBook()): Promise<void> {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  await fetch(`${run.http}${link}`, { redirect: 'manual' })
  const account = (await run.auth!.ensureAccount('ada@example.com')).id
  await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: run.projectId, ...doc }) })
  await run.ai!.vault.save(account, 'anthropic', KEY)
}
async function openEditor(lang: Lang = 'sv'): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(
    <Language lang={lang}>
      <StatusLive>
        <EditorPage onNavigate={() => undefined} />
      </StatusLive>
    </Language>,
  )
  await screen.findByRole('heading', { level: 1, name: 'Skogens herrar' })
  await screen.findByRole('complementary', { name: lang === 'en' ? 'AI help' : 'AI-hjälp' })
}
const panel = () => screen.getByRole('complementary', { name: 'AI-hjälp' })
const ask = (question: string) => {
  const field = screen.getByRole('textbox', { name: 'Fråga om spelet' })
  fireEvent.change(field, { target: { value: question } })
  fireEvent.keyDown(field, { key: 'Enter' })
}
const proposal = () => within(panel()).getByRole('group', { name: /^Förslag/ })
const logged = async () => run.projects.readEdits(run.projectId, 0)
const book = () => document.querySelector<HTMLElement>('article.byd-rulebook')!
async function askForRules(doc?: ProjectDoc): Promise<void> {
  await ownGame(doc)
  await openEditor()
  ask('Skriv regler för att dra kort [regler]')
  await within(panel()).findByRole('button', { name: 'Godta alla' })
}

describe('rule text proposed in the panel', () => {
  it('says what it is, and reads the rules with what they name said by its name', async () => {
    await askForRules()
    expect(proposal().getAttribute('aria-label')).toBe('Förslag · 1 tillägg i regelboken')
    const part = proposal().querySelector('.byd-ai-card[data-rules]')!
    expect(part.textContent).toContain('Att dra kort')
    expect(part.textContent).toContain('Börja din tur med att dra ett kort från Draghög.')
    expect(part.textContent).not.toContain('[[')
    expect(within(panel()).getByRole('button', { name: 'Visa i regelboken' })).toBeTruthy()
    expect(await logged()).toHaveLength(0)
  })
})

describe('rule text shown in the rulebook', () => {
  it('takes the designer to Regler, where the book’s own rendering draws the new blocks marked, and nothing is written', async () => {
    await askForRules()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa i regelboken' }))
    await waitFor(() => expect(document.getElementById(tabId('rules'))!.getAttribute('aria-selected')).toBe('true'))
    const marked = await waitFor(() => {
      const found = [...book().querySelectorAll<HTMLElement>('[data-ai="new"]')]
      expect(found).toHaveLength(3)
      return found
    })
    // The book's own heading, paragraph and list, the reference drawn as the zone's name.
    expect(marked[0]!.querySelector('h2')!.textContent).toBe('Att dra kort')
    expect(marked[1]!.textContent).toContain('Börja din tur med att dra ett kort från Draghög.')
    expect(marked[2]!.querySelectorAll('li')).toHaveLength(2)
    // Said once for the section, in words on the page and not only in a dashed edge (L12).
    expect(marked[0]!.textContent).toContain('Förslag')
    expect(marked[1]!.querySelector('.byd-rules-ai-mark')).toBeNull()
    // The book's own blocks stand where they stood, unmarked, and nothing in it opens for writing.
    expect(book().querySelector('[data-block="b2"]')!.hasAttribute('data-ai')).toBe(false)
    expect(book().querySelector('.byd-rules-add')).toBeNull()
    expect(book().querySelector('[role="button"]')).toBeNull()
    // The proposal's line stands in the tab's own row, in the tools' place (#1054): a row of its own
    // under it moved the book when it came and went.
    const band = screen.getByText(/^AI-hjälpens förslag/).closest<HTMLElement>('[data-proposal]')!
    expect(band.closest('.byd-rules-bar')).not.toBeNull()
    expect(within(band.closest<HTMLElement>('.byd-rules-bar')!).queryByRole('group', { name: 'Verktyg' })).toBeNull()
    expect(band.textContent).toContain('1 tillägg i regelboken')
    expect(within(panel()).getByRole('button', { name: 'Visa i regelboken' }).getAttribute('aria-pressed')).toBe('true')
    expect(await logged()).toHaveLength(0)
    // Hidden again, the book is the game's own and can be written in.
    fireEvent.click(within(band).getByRole('button', { name: 'Dölj förslaget' }))
    await waitFor(() => expect(book().querySelector('[data-ai]')).toBeNull())
    expect(book().querySelector('[role="button"]')).not.toBeNull()
  })
})

describe('rule text beside new cards', () => {
  it('shows the cards on the wall, and the rule text in the book from its own link', async () => {
    await ownGame()
    await openEditor()
    ask('Ett kort och regler för det [regler] [kort:1]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    expect(proposal().getAttribute('aria-label')).toBe('Förslag · 1 nytt kort, 1 tillägg i regelboken')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa på väggen' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-proposed]')).toHaveLength(1))
    const link = within(proposal().querySelector<HTMLElement>('.byd-ai-card[data-rules]')!).getByRole('button', { name: 'Visa i regelboken' })
    fireEvent.click(link)
    await waitFor(() => expect(document.getElementById(tabId('rules'))!.getAttribute('aria-selected')).toBe('true'))
    await waitFor(() => expect(book().querySelectorAll('[data-ai="new"]')).toHaveLength(3))
    // In the book, the proposal's own button says the book too, and it stays shown there.
    expect(within(panel()).getByRole('button', { name: 'Visa i regelboken', pressed: true })).toBeTruthy()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => e.v)).toEqual(['addRow', 'spliceRules'])
    await waitFor(() => expect(proposal().textContent).toContain('Godtaget: 1 nytt kort och 1 tillägg i regelboken.'))
  })
})

describe('rule text that rewrites the book', () => {
  it('stands where the block it replaces stood, the old struck with its word before the new marked «Ändrat»', async () => {
    await ownGame()
    await openEditor()
    ask('Skriv om översikten [regler-om]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    expect(proposal().getAttribute('aria-label')).toBe('Förslag · 1 omskrivning i regelboken')
    expect(proposal().textContent).toContain('Ersätter 1 block i boken')
    expect(proposal().textContent).toContain('Kortet du drar tar du från Draghög.')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa i regelboken' }))
    await waitFor(() => expect(book().querySelectorAll('[data-ai]')).toHaveLength(3))
    const marked = [...book().querySelectorAll<HTMLElement>('[data-ai]')]
    expect(marked.map((el) => [el.dataset.block, el.dataset.ai])).toEqual([
      ['b2', 'gone'],
      ['b3', 'changed'],
      ['b4', 'changed'],
    ])
    expect(marked[0]!.querySelector('.byd-rules-mark')!.textContent).toBe('Ersätts')
    expect(marked[1]!.querySelector('.byd-rules-ai-mark')!.textContent).toContain('Ändrat')
    expect(marked[2]!.querySelector('.byd-rules-ai-mark')).toBeNull()
    expect(screen.getByText(/^AI-hjälpens förslag/).textContent).toContain('1 omskrivning i regelboken')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    await waitFor(() => expect(book().querySelector('[data-ai]')).toBeNull())
    expect([...book().querySelectorAll('[data-block]')].map((el) => (el as HTMLElement).dataset.block)).toEqual(['b1', 'b3', 'b4'])
    expect(proposal().textContent).toContain('Godtaget: 1 omskrivning i regelboken.')
  })
})

describe('accepting rule text', () => {
  it('is one composite edit and one step back', async () => {
    await askForRules()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => e.v)).toEqual(['spliceRules'])
    await waitFor(() => expect(proposal().textContent).toContain('Godtaget: 1 tillägg i regelboken.'))
    fireEvent.click(document.getElementById(tabId('rules'))!)
    await waitFor(() => expect(book().textContent).toContain('Börja din tur med att dra ett kort från Draghög.'))
    fireEvent.click(screen.getByRole('button', { name: 'Ångra det godtagna förslaget' }))
    await waitFor(async () => expect(await logged()).toHaveLength(2))
    const restored = (await logged())[1]!.intent
    expect(restored.v === 'restore' && restored.doc.rules).toEqual(withBook().rules)
    await waitFor(() => expect(book().textContent).not.toContain('Börja din tur'))
  })

  it('starts the book for a game that has none', async () => {
    await askForRules({ ...projectDoc(), rules: undefined } as ProjectDoc)
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    fireEvent.click(document.getElementById(tabId('rules'))!)
    await waitFor(() => expect(book().textContent).toContain('Att dra kort'))
  })
})

describe('rule text that cannot be used', () => {
  it('is refused with the reason, naming the zone the game does not have, and writes nothing', async () => {
    await ownGame()
    await openEditor()
    ask('Trasiga regler [regler-trasig]')
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain('Förslaget gick inte att använda')
    expect(alert.textContent).toContain('Regeltext 1 («Att dra kort») nämner zonen «finns-inte», som spelet inte har.')
    expect(within(panel()).queryByRole('button', { name: 'Godta alla' })).toBeNull()
    expect(await logged()).toHaveLength(0)
  })
})

describe('in English', () => {
  it('speaks the reader’s language', async () => {
    await ownGame()
    await openEditor('en')
    const field = screen.getByRole('textbox', { name: 'Ask about the game' })
    fireEvent.change(field, { target: { value: 'Rules for drawing [regler]' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    const group = await within(screen.getByRole('complementary', { name: 'AI help' })).findByRole('group', { name: 'Proposal · 1 addition to the rulebook' })
    expect(within(group).getByRole('button', { name: 'Show in the rulebook' })).toBeTruthy()
  })
})

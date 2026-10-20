// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { applyEdit } from '@byd/server/doc'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language, type Lang } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// New cards as a proposal (#1002, #940 variant A): the designer asks for cards, each card arrives in
// the panel drawn by the one renderer (E2) as it is written, can be laid among the deck's cards on
// the wall as ghosts that are not in the document, and is accepted in one step — one edit, one step
// back — or discarded, which changes nothing. A proposal the game cannot take is said to be the
// AI's, with the reason. Against the real server and the fake providers behind it.
const KEY = 'sk-ant-api03-good-NotARealKey-0123456789abcdefx7Qd'
let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true, ai: true })
})
afterEach(async () => {
  await run.stop()
})

async function ownGame(doc: ProjectDoc = projectDoc()): Promise<void> {
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
const proposedCards = () => [...proposal().querySelectorAll('.byd-ai-card .byd-preview')]
const rows = async () => (await run.projects.load(run.projectId))?.rows.map((r) => r.id)
const logged = async () => run.projects.readEdits(run.projectId, 0)

// The game as the actor holds it after the log: the version it was opened on and every line since.
// A step back writes back only what the step changed (#1056), so it is read off the result and not
// off the line.
const held = async (): Promise<ProjectDoc> => {
  const rec = await run.projects.load(run.projectId)
  if (!rec) throw new Error('no project')
  return (await logged()).reduce((doc: ProjectDoc, e) => applyEdit(doc, e.intent), rec)
}

describe('a proposal of new cards', () => {
  it('draws each card in the panel as it arrives, by the one renderer', async () => {
    await ownGame()
    await openEditor()
    ask('Tre kort [kort:3] [sakta]')
    // The first card is there while the others are still being written, and nothing can be
    // accepted until the proposal is whole.
    await waitFor(() => expect(proposedCards()).toHaveLength(1))
    expect(within(proposal()).queryByRole('button', { name: 'Godta alla' })).toBeNull()
    await waitFor(() => expect(proposedCards()).toHaveLength(3), { timeout: 5000 })
    await within(proposal()).findByRole('button', { name: 'Godta alla' })
    expect(proposal().getAttribute('aria-label')).toBe('Förslag · 3 nya kort')
    expect([...proposal().querySelectorAll('.byd-ai-card-name')].map((n) => n.textContent)).toEqual(['Förslag 1', 'Förslag 2', 'Förslag 3'])
    // The cards are the compiler's, with the values the model proposed on them.
    expect(proposedCards()[0]!.textContent).toContain('Förslag 1')
    expect(proposedCards()[0]!.textContent).toContain('Text 1.')
    expect(panel().textContent).toContain('Här är 3 kort.')
  })

  it('is accepted in one step: one line in the log, one step back, and the cards in the deck', async () => {
    await ownGame()
    await openEditor()
    ask('Tre kort [kort:3]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v).toBe('compound')
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => e.v)).toEqual(['addRow', 'addRow', 'addRow'])
    await waitFor(() => expect(proposal().textContent).toContain('Godtaget: 3 nya kort i leken.'))
    expect(within(proposal()).queryByRole('button', { name: 'Godta alla' })).toBeNull()
    // One press of the header's undo takes the whole proposal back, and says what it took.
    const undo = screen.getByRole('button', { name: 'Ångra det godtagna förslaget' })
    fireEvent.click(undo)
    await waitFor(async () => expect(await logged()).toHaveLength(2))
    expect((await logged())[1]!.intent.v).toBe('revert')
    expect((await held()).rows.map((r) => r.id)).toEqual(['dragon', 'knight', 'wizard'])
  })

  it('is discarded without a change to the game', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Kasta' }))
    await waitFor(() => expect(proposal().textContent).toContain('Kastat. Ingenting ändrades.'))
    expect(await logged()).toHaveLength(0)
    expect(await rows()).toEqual(['dragon', 'knight', 'wizard'])
    expect(screen.getByRole('button', { name: 'Ångra: inget att ta tillbaka' })).toBeTruthy()
  })

  it('lays the cards on the wall as ghosts marked «Förslag», which are not in the game', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    const show = await within(panel()).findByRole('button', { name: 'Visa på väggen' })
    expect(show.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(show)
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-proposed]')).toHaveLength(2))
    expect(show.getAttribute('aria-pressed')).toBe('true')
    const ghost = document.querySelector<HTMLElement>('.byd-wall-card[data-proposed]')!
    expect(ghost.textContent).toContain('Förslag')
    expect(ghost.getAttribute('aria-label')).toMatch(/^Förslag: Förslag 1/)
    // Choosing a ghost chooses nothing: it is not a card of the game.
    fireEvent.click(ghost)
    expect(ghost.getAttribute('aria-selected')).toBe('false')
    expect(document.querySelectorAll('.byd-wall-card:not([data-proposed])')).toHaveLength(3)
    // The deck's count is the deck's, and the proposal is said apart from it.
    expect(document.querySelector('.byd-wall-view')!.textContent).toMatch(/3 kort.*2 föreslagna/)
    expect(await logged()).toHaveLength(0)
    // Discarded, they leave the wall with it.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Kasta' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-proposed]')).toHaveLength(0))
  })

  it('keeps the view’s one filled button in the header: accepting is outlined (L13)', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    const accept = await within(panel()).findByRole('button', { name: 'Godta alla' })
    expect(accept.classList.contains('byd-secondary')).toBe(true)
    expect(panel().querySelector('.byd-primary')).toBeNull()
  })

  it('shows what the physical check says about the proposed cards, and does not refuse them for it (E5)', async () => {
    const doc = projectDoc()
    const front = doc.template.faces['front']!
    // A title as pale as the paper it stands on, which every card the template draws inherits.
    front.base = front.base.map((el) => (el.id === 'title' && el.kind === 'text' ? { ...el, color: '#f2e8d6' } : el))
    await ownGame(doc)
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    const checks = within(proposal()).getByText(/^Fysisk kontroll/)
    expect(checks.closest('div')!.textContent).toMatch(/kontrast/i)
    expect(within(proposal()).getByRole('button', { name: 'Godta alla' })).toBeTruthy()
  })
})

describe('a proposal the game cannot take', () => {
  it('is said to be the AI’s answer, with the reason, and can be asked again', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [oanvändbart]')
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain('Förslaget gick inte att använda')
    expect(alert.textContent).toContain('Kort 2 («Förslag 2») skriver i fältet «trolldom», som spelet inte har.')
    expect(alert.textContent).toContain('Det var AI:ns svar som inte gick att använda, inte ditt spel. Ingenting ändrades.')
    expect(within(panel()).queryByRole('button', { name: 'Godta alla' })).toBeNull()
    const before = run.ai!.fake.calls.length
    // Asked again once the answer has ended, as every failed answer is.
    fireEvent.click(await within(alert).findByRole('button', { name: 'Försök igen' }))
    await waitFor(() => expect(run.ai!.fake.calls.length).toBe(before + 1))
    expect(await logged()).toHaveLength(0)
  })

  it('says so when the answer ran out before the proposal was whole', async () => {
    await ownGame()
    await openEditor()
    ask('Tre kort [kort:3] [kapat]')
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain('Förslaget gick inte att använda')
    expect(alert.textContent).toContain('Svaret tog slut innan förslaget var helt.')
  })
})

describe('in English', () => {
  it('speaks the reader’s language', async () => {
    await ownGame()
    await openEditor('en')
    const field = screen.getByRole('textbox', { name: 'Ask about the game' })
    fireEvent.change(field, { target: { value: 'Two cards [oanvändbart]' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    const alert = await within(screen.getByRole('complementary', { name: 'AI help' })).findByRole('alert')
    expect(alert.textContent).toContain('The proposal could not be used')
    expect(alert.textContent).toContain('Card 2 (“Förslag 2”) writes in the field “trolldom”, which the game does not have.')
  })
})

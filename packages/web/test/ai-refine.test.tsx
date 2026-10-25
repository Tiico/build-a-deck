// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ProjectDoc } from '@byd/server'
import { EditorPage } from '../src/editor/EditorPage.js'
import { Language, type Lang } from '../src/i18n/index.js'
import { StatusLive } from '../src/status/StatusLive.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

// Refining a proposal before it is accepted (#1004, #940 variant A): while a proposal waits, the line
// under it takes a follow-up instruction, which goes to the model with the proposal and the parts the
// designer left out of it; the refined proposal streams in as any proposal does and takes the old
// one's place in the panel and on the wall. Nothing is written until a proposal is accepted, and a
// refine stopped half-way leaves the proposal it refined waiting. Against the real server and the
// fake providers behind it, whose `[förfina]` answers with the proposal revised.
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
const say = (field: HTMLElement, text: string) => {
  fireEvent.change(field, { target: { value: text } })
  fireEvent.keyDown(field, { key: 'Enter' })
}
const ask = (question: string) => say(screen.getByRole('textbox', { name: 'Fråga om spelet' }), question)
const refine = (instruction: string) => say(screen.getByRole('textbox', { name: 'Förfina förslaget eller fråga något nytt' }), instruction)
const proposals = () => within(panel()).queryAllByRole('group', { name: /^Förslag/ })
const names = (group: HTMLElement) => [...group.querySelectorAll('.byd-ai-card-name')].map((n) => n.textContent)
const lastSaid = () => (run.ai!.fake.calls.filter((call) => call.body !== undefined).at(-1)!.body as { messages: { content: string }[] }).messages.at(-1)!.content
const logged = async () => run.projects.readEdits(run.projectId, 0)
const rows = async () => (await run.projects.load(run.projectId))?.rows.map((r) => r.id)

describe('the line under a waiting proposal', () => {
  it('refines it: the proposal goes with the instruction, and the refined one takes its place', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    // The line says what it does now, and that the proposal goes with what is written in it.
    const line = screen.getByRole('textbox', { name: 'Förfina förslaget eller fråga något nytt' })
    expect(line.getAttribute('placeholder')).toBe('Förfina förslaget, till exempel «gör dem mildare» eller «färre kort»')
    expect(within(panel()).getByRole('button', { name: 'Förfina' })).toBeTruthy()
    expect(panel().querySelector('.byd-ai-chip')!.textContent).toBe('förslaget')
    refine('Gör dem dyrare [förfina]')
    await waitFor(() => expect(within(panel()).getAllByRole('button', { name: 'Godta alla' })).toHaveLength(1))
    await waitFor(() => expect(proposals().map((g) => names(g))).toEqual([[], ['Förslag 1 (förfinat)', 'Förslag 2 (förfinat)']]))
    expect(lastSaid()).toMatch(/^## Proposal to refine\n/)
    expect(lastSaid()).toContain('"value":"Förslag 2"')
    // The old one stands in the conversation as replaced, and nothing of it can be accepted.
    expect(panel().textContent).toContain('Ersatt av det förfinade förslaget nedan.')
    expect(await logged()).toHaveLength(0)
  })

  it('sends the parts left out with «Välj delar…», and the refined proposal comes whole, every part chosen', async () => {
    await ownGame()
    await openEditor()
    ask('Tre kort [kort:3]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Välj delar…' }))
    fireEvent.click(within(panel()).getByRole('checkbox', { name: 'Ta med Förslag 2' }))
    refine('Gör dem dyrare [förfina]')
    await waitFor(() => expect(panel().textContent).toContain('Ersatt av det förfinade förslaget nedan.'))
    expect(proposals().map((g) => names(g)).at(-1)).toEqual(['Förslag 1 (förfinat)', 'Förslag 3 (förfinat)'])
    expect(lastSaid()).toMatch(/## Left out by the designer\n[^#]*- New card 2 \(Förslag 2\)/)
    // The choice was the old proposal's: the refined one is a new proposal, with nothing left out
    // and the choice closed, so «Godta alla» is where it was.
    expect(within(panel()).queryAllByRole('checkbox')).toHaveLength(0)
    expect(within(panel()).getByRole('button', { name: 'Godta alla' })).toBeTruthy()
    expect(within(panel()).getByRole('button', { name: 'Välj delar…' })).toBeTruthy()
  })

  it('replaces the proposal on the wall with the refined one', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Visa på väggen' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-proposed]')).toHaveLength(2))
    refine('Gör dem dyrare [förfina]')
    await waitFor(() => expect([...document.querySelectorAll('.byd-wall-card[data-proposed]')].map((g) => g.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^Förslag: Förslag 1 \(förfinat\)/), expect.stringMatching(/^Förslag: Förslag 2 \(förfinat\)/)]))
    // The refined proposal is the one on the wall, and its switch says so.
    expect(within(panel()).getByRole('button', { name: 'Visa på väggen' }).getAttribute('aria-pressed')).toBe('true')
    expect(await logged()).toHaveLength(0)
  })

  it('refined and then discarded, leaves the game untouched', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    refine('Gör dem dyrare [förfina]')
    await waitFor(() => expect(panel().textContent).toContain('Ersatt av det förfinade förslaget nedan.'))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Kasta' }))
    await waitFor(() => expect(panel().textContent).toContain('Kastat. Ingenting ändrades.'))
    expect(await logged()).toHaveLength(0)
    expect(await rows()).toEqual(['dragon', 'knight', 'wizard'])
    // Nothing waits any more, so the line asks again.
    expect(screen.getByRole('textbox', { name: 'Fråga om spelet' })).toBeTruthy()
  })

  it('refined and then accepted, lands as the refined proposal in one step', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    refine('Gör dem dyrare [förfina]')
    await waitFor(() => expect(panel().textContent).toContain('Ersatt av det förfinade förslaget nedan.'))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => (e.v === 'addRow' ? e.fields['title'] : null))).toEqual(['Förslag 1 (förfinat)', 'Förslag 2 (förfinat)'])
  })

  it('stopped half-way, leaves the proposal it refined waiting, on the wall as it was', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Visa på väggen' }))
    refine('Gör dem dyrare [förfina] [sakta]')
    // The first refined card has come, and the refine is stopped from the line's own button.
    await waitFor(() => expect(proposals().at(-1)!.getAttribute('aria-label')).toBe('Förslag på väg · 1 nytt kort'))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Avbryt' }))
    await waitFor(() => expect(run.ai!.fake.streams.at(-1)!.closed).toBe(true))
    expect(panel().textContent).toContain('Avbrutet.')
    expect(panel().textContent).not.toContain('Ersatt av det förfinade förslaget nedan.')
    expect(proposals().map((g) => names(g))).toEqual([['Förslag 1', 'Förslag 2']])
    expect(within(panel()).getByRole('button', { name: 'Godta alla' })).toBeTruthy()
    expect([...document.querySelectorAll('.byd-wall-card[data-proposed]')].map((g) => g.getAttribute('aria-label'))).toEqual([expect.stringMatching(/^Förslag: Förslag 1 —|^Förslag: Förslag 1$/), expect.stringMatching(/^Förslag: Förslag 2 —|^Förslag: Förslag 2$/)])
    // And it can still be refined.
    expect(screen.getByRole('textbox', { name: 'Förfina förslaget eller fråga något nytt' })).toBeTruthy()
    expect(await logged()).toHaveLength(0)
  })

  it('answered in words, leaves the proposal waiting', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    refine('Varför just de här?')
    await waitFor(() => expect(panel().textContent).toContain('Du frågade: «Varför just de här?».'))
    expect(panel().textContent).not.toContain('Ersatt av det förfinade förslaget nedan.')
    expect(within(panel()).getByRole('button', { name: 'Godta alla' })).toBeTruthy()
    expect(screen.getByRole('textbox', { name: 'Förfina förslaget eller fråga något nytt' })).toBeTruthy()
  })

  it('answered with a proposal that cannot be used, leaves the proposal it refined waiting', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    refine('Något annat [oanvändbart]')
    await within(panel()).findByText('Förslaget gick inte att använda')
    expect(panel().textContent).not.toContain('Ersatt av det förfinade förslaget nedan.')
    expect(within(panel()).getByRole('button', { name: 'Godta alla' })).toBeTruthy()
  })

  it('is no longer wanted once the proposal it refines is decided', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    refine('Gör dem dyrare [förfina] [sakta]')
    await waitFor(() => expect(run.ai!.fake.streams).toHaveLength(2))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Kasta' }))
    await waitFor(() => expect(run.ai!.fake.streams.at(-1)!.closed).toBe(true))
    expect(panel().textContent).toContain('Kastat. Ingenting ändrades.')
    expect(within(panel()).queryByRole('button', { name: 'Godta alla' })).toBeNull()
  })

  it('keeps the view’s one filled button in the header (L13), and speaks English', async () => {
    await ownGame()
    await openEditor('en')
    const field = screen.getByRole('textbox', { name: 'Ask about the game' })
    say(field, 'Two cards [kort:2]')
    const help = screen.getByRole('complementary', { name: 'AI help' })
    await within(help).findByRole('button', { name: 'Accept all' })
    const line = screen.getByRole('textbox', { name: 'Refine the proposal or ask something new' })
    expect(line.getAttribute('placeholder')).toBe('Refine the proposal, for example “make them milder” or “fewer cards”')
    expect(help.querySelector('.byd-ai-chip')!.textContent).toBe('the proposal')
    const button = within(help).getByRole('button', { name: 'Refine' })
    expect(button.classList.contains('byd-secondary')).toBe(true)
    expect(help.querySelector('.byd-primary')).toBeNull()
    say(line, 'Pricier [förfina]')
    await waitFor(() => expect(help.textContent).toContain('Replaced by the refined proposal below.'))
  })
})

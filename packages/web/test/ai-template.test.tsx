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

// A template proposal (#1005, #940 variant A): the designer asks for a card type in words and gets a
// face in the template's element model with the new field it needs. The panel draws a few of the
// deck's cards with it through the one renderer (E2), says the new field and how many cards get a
// value, and what the physical check says (E5); the wall shows the whole deck drawn with it, every
// card it draws differently marked «Ändrat»; accepting is one composite edit and one step back; and a
// template with an element outside the card is refused with the reason. Against the real server and
// the fake providers behind it, whose `[mall]` and `[mall-trasig]` answer with such templates.
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
const wallCard = (cardRef: string) => document.querySelector<HTMLElement>(`.byd-wall-card[data-card-ref="${cardRef}"]`)!
const proposal = () => within(panel()).getByRole('group', { name: /^Förslag/ })
const logged = async () => run.projects.readEdits(run.projectId, 0)
async function askForTemplate(): Promise<void> {
  await ownGame()
  await openEditor()
  ask('Ett kort med kraft i ett mynt [mall]')
  await within(panel()).findByRole('button', { name: 'Godta alla' })
}

describe('a template proposal in the panel', () => {
  it('says what it is, draws a few of the deck’s cards with it, and names the new field and the cards it fills', async () => {
    await askForTemplate()
    expect(proposal().getAttribute('aria-label')).toBe('Förslag · ny mall för framsidan, 1 nytt fält')
    const drawn = [...proposal().querySelectorAll('.byd-ai-card[data-template] .byd-preview')]
    expect(drawn.length).toBeGreaterThan(0)
    // Drawn by the one renderer with the proposed template: the coin the template brings is on it.
    expect(drawn[0]!.querySelector('[data-element="coin"]')).not.toBeNull()
    expect(proposal().textContent).toContain('Nytt fält: kraft')
    expect(proposal().textContent).toContain('2 kort får ett värde')
    // The physical check runs on the cards the template draws, and says what it finds before
    // anything is accepted — the coin's small text — without stopping it (E5).
    const checks = proposal().querySelector('.byd-ai-checks')!
    expect(checks.textContent).toContain('Fysisk kontroll')
    expect(checks.textContent).toContain('för liten text · 2 kort')
    // For a card the template only redraws, only what is on the face it draws: the fixture's plain
    // back, which falls short of the bleed, is the game's own remark and not the proposal's.
    expect(checks.textContent).not.toContain('når inte utfallet')
    expect(within(panel()).getByRole('button', { name: 'Godta alla' })).toBeTruthy()
    // Nothing is written until it is accepted.
    expect(await logged()).toHaveLength(0)
  })
})

describe('a template proposal on the wall', () => {
  it('draws the whole deck with the proposed template, each card it draws differently marked «Ändrat», and the new values old → new', async () => {
    await askForTemplate()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa på väggen' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-changed]')).toHaveLength(3))
    for (const ref of ['dragon', 'knight', 'wizard']) {
      expect(wallCard(ref).textContent).toContain('Ändrat')
      // The wall draws the card through the one renderer with the template the proposal brings.
      expect(wallCard(ref).querySelector('[data-element="frame"]')).not.toBeNull()
    }
    // The fake's coin is shown only on cards that have a value in the new field.
    expect(wallCard('dragon').querySelector('[data-element="coin"]')).not.toBeNull()
    expect(wallCard('wizard').querySelector('[data-element="coin"]')).toBeNull()
    expect(wallCard('dragon').closest('.byd-wall-cell')!.querySelector('.byd-wall-changes')!.textContent).toContain('kraft: — → 1')
    expect(wallCard('wizard').getAttribute('aria-label')).toBe('Ändrat i förslaget: Trollkarl — ritat med den föreslagna mallen')
    expect(document.querySelector('.byd-wall-deck')!.hasAttribute('data-proposing')).toBe(true)
    expect(await logged()).toHaveLength(0)
    // Off the wall again, the deck is drawn with its own template.
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa på väggen' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-changed]')).toHaveLength(0))
    expect(wallCard('dragon').querySelector('[data-element="coin"]')).toBeNull()
  })
})

describe('a template proposal from Tabell', () => {
  // A template is previewed on the wall (#1005, #940): the table holds the game's columns and no
  // template, so its comparison would count every card as changed and show no new column at all.
  it('is shown on the wall even when Tabell is open, and never through the table’s comparison', async () => {
    await askForTemplate()
    fireEvent.click(document.getElementById(tabId('table'))!)
    await screen.findByRole('checkbox', { name: 'markera dragon' })
    const show = within(panel()).getByRole('button', { name: 'Visa på väggen' })
    fireEvent.click(show)
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-changed]')).toHaveLength(3))
    fireEvent.click(document.getElementById(tabId('table'))!)
    await screen.findByRole('checkbox', { name: 'markera dragon' })
    expect(document.querySelector('.byd-data-compare')).toBeNull()
    expect(within(panel()).getByRole('button', { name: 'Visa på väggen' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('accepting a template proposal', () => {
  it('is one composite edit — the field, the face and the values — and one step back', async () => {
    await askForTemplate()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => e.v)).toEqual(['addField', 'replaceFace', 'setCell', 'setCell'])
    await waitFor(() => expect(proposal().textContent).toContain('Godtaget: ny mall för framsidan och 1 nytt fält.'))
    await waitFor(() => expect(wallCard('dragon').querySelector('[data-element="coin"]')).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Ångra det godtagna förslaget' }))
    await waitFor(async () => expect(await logged()).toHaveLength(2))
    const restored = (await logged())[1]!.intent
    expect(restored.v === 'restore' && restored.doc.template).toEqual(projectDoc().template)
    expect(restored.v === 'restore' && restored.doc.rows.every((r) => !('kraft' in r.fields))).toBe(true)
  })

  it('is one part among the others in «Välj delar…», named for its face', async () => {
    await ownGame()
    await openEditor()
    ask('En mall och ett kort [mall] [kort:1]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    fireEvent.click(within(panel()).getByRole('button', { name: 'Välj delar…' }))
    const tick = within(proposal()).getByRole('checkbox', { name: 'Ta med Mall för framsidan' })
    expect(tick).toBe(document.activeElement)
    fireEvent.click(tick)
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta valda' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => e.v)).toEqual(['addRow'])
  })
})

describe('a template proposal that cannot be used', () => {
  it('is refused with the reason, naming the layer outside the card, and writes nothing', async () => {
    await ownGame()
    await openEditor()
    ask('En trasig mall [mall-trasig]')
    const alert = await within(panel()).findByRole('alert')
    expect(alert.textContent).toContain('Förslaget gick inte att använda')
    expect(alert.textContent).toContain('Mallens lager «title» står utanför kortet.')
    expect(within(panel()).queryByRole('button', { name: 'Godta alla' })).toBeNull()
    expect(await logged()).toHaveLength(0)
  })
})

describe('in English', () => {
  it('speaks the reader’s language', async () => {
    await ownGame()
    await openEditor('en')
    const field = screen.getByRole('textbox', { name: 'Ask about the game' })
    fireEvent.change(field, { target: { value: 'A card with a coin [mall]' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    const group = await within(screen.getByRole('complementary', { name: 'AI help' })).findByRole('group', { name: 'Proposal · new template for the front, 1 new field' })
    expect(group.textContent).toContain('New field: kraft')
    expect(group.textContent).toContain('2 cards get a value')
  })
})

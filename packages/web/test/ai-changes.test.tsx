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

// Changed cards and «Välj delar…» (#1003, #940 variant A): the cards the designer has selected — the
// card chosen on the wall or in the table, and the rows ticked in Tabell — go with her question and
// are said in the panel before they go; a proposal can change cards the game has, which the panel,
// the wall and the table show as old → new in the proposal's own words; and a chosen part of a
// proposal is accepted as exactly those parts, one edit and one step back. Against the real server
// and the fake providers behind it.
const KEY = 'sk-ant-api03-good-NotARealKey-0123456789abcdefx7Qd'
let run: Running
beforeEach(async () => {
  localStorage.clear()
  run = await startServer({ auth: true, ai: true })
})
afterEach(async () => {
  await run.stop()
})

// The sample game with a column of numbers, so a change is a change of a number as well as of words.
const game = (): ProjectDoc => {
  const doc = projectDoc()
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, kostnad: 3 - i } }))
  return doc
}
async function ownGame(doc: ProjectDoc = game()): Promise<void> {
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
const chips = () => [...panel().querySelectorAll('.byd-ai-chip')].map((chip) => chip.textContent)
const wallCard = (cardRef: string) => document.querySelector<HTMLElement>(`.byd-wall-card[data-card-ref="${cardRef}"]`)!
const toTab = (mode: 'wall' | 'table') => fireEvent.click(document.getElementById(tabId(mode))!)
const lastQuestion = () => {
  const body = run.ai!.fake.calls.at(-1)!.body as { messages: { content: string }[] }
  return body.messages.at(-1)!.content
}
const proposal = () => within(panel()).getByRole('group', { name: /^Förslag/ })
const logged = async () => run.projects.readEdits(run.projectId, 0)

describe('the selected cards as the question’s context', () => {
  it('sends the card chosen on the wall and the rows ticked in Tabell, and says so before they go', async () => {
    await ownGame()
    await openEditor()
    expect(chips()).toEqual(['3 kort', 'mallen', 'bordet'])
    fireEvent.click(wallCard('dragon'))
    await waitFor(() => expect(chips()[0]).toBe('valt: Drake'))
    toTab('table')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'markera wizard' }))
    await waitFor(() => expect(chips()[0]).toBe('2 markerade'))
    ask('Gör de här billigare')
    await waitFor(() => expect(run.ai!.fake.streams).toHaveLength(1))
    const said = lastQuestion()
    expect(said).toMatch(/^## Selected cards/)
    expect(said).toContain('"id":"dragon"')
    expect(said).toContain('"id":"wizard"')
    expect(said).not.toContain('"id":"knight"')
    expect(said.endsWith('Gör de här billigare')).toBe(true)
  })

  it('sends nothing but the question when nothing is selected', async () => {
    await ownGame()
    await openEditor()
    ask('Vad heter spelet?')
    await waitFor(() => expect(run.ai!.fake.streams).toHaveLength(1))
    expect(lastQuestion()).toBe('Vad heter spelet?')
  })
})

describe('a proposal of changed cards', () => {
  async function changeTwo(): Promise<void> {
    await ownGame()
    await openEditor()
    fireEvent.click(wallCard('dragon'))
    toTab('table')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'markera knight' }))
    await waitFor(() => expect(chips()[0]).toBe('2 markerade'))
    ask('Sänk kostnaden [ändra:2] [kort:1]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
  }

  it('shows each changed card in the panel with what each cell was and becomes', async () => {
    await changeTwo()
    expect(proposal().getAttribute('aria-label')).toBe('Förslag · 1 nytt kort, 2 ändrade kort')
    const changed = [...proposal().querySelectorAll('.byd-ai-card[data-changed]')]
    expect(changed).toHaveLength(2)
    expect(changed[0]!.textContent).toContain('Drake')
    expect(changed[0]!.textContent).toContain('title: Drake → Drake II')
    expect(changed[0]!.textContent).toContain('kostnad: 3 → 2')
    // The card is drawn by the one renderer with the values it would have.
    expect(changed[0]!.querySelector('.byd-preview')!.textContent).toContain('Drake II')
  })

  it('lays the changed cards on the wall in their own place, marked «Ändrat» with old → new under them', async () => {
    await changeTwo()
    toTab('wall')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa på väggen' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-changed]')).toHaveLength(2))
    const dragon = wallCard('dragon')
    expect(dragon.hasAttribute('data-changed')).toBe(true)
    expect(dragon.textContent).toContain('Ändrat')
    expect(dragon.textContent).toContain('kostnad: 3 → 2')
    expect(dragon.getAttribute('aria-label')).toBe('Ändrat i förslaget: Drake — title: Drake → Drake II, kostnad: 3 → 2')
    expect(dragon.querySelector('.byd-preview')!.textContent).toContain('Drake II')
    // The wall makes room for the marks while a proposal stands on it.
    expect(document.querySelector('.byd-wall-deck')!.hasAttribute('data-proposing')).toBe(true)
    // A changed card is still the game's card, and the deck's count is the deck's.
    expect(document.querySelector('.byd-wall-view')!.textContent).toMatch(/3 kort.*1 föreslaget/)
    expect(await logged()).toHaveLength(0)
  })

  it('shows the same proposal in Tabell through the table’s comparison, in the proposal’s own words', async () => {
    await changeTwo()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa i tabellen' }))
    const strip = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('.byd-data-compare')
      expect(found).not.toBeNull()
      return found!
    })
    expect(strip.textContent).toMatch(/^AI-hjälpens förslag/)
    expect(strip.textContent).not.toMatch(/Jämför med version/)
    expect(within(strip).queryByRole('button', { name: 'Sluta jämföra' })).toBeNull()
    const dragon = document.querySelector('tr[data-card-ref="dragon"]')!
    expect(dragon.getAttribute('data-change')).toBe('changed')
    expect(dragon.querySelector('td[data-col="kostnad"] .byd-data-was')!.textContent).toBe('3')
    expect(dragon.querySelector('td[data-col="kostnad"]')!.textContent).toContain('2')
    // A proposed card is a record to look at, with nothing in it to write in.
    expect(dragon.querySelector('input')).toBeNull()
    const added = document.querySelector('tr[data-change="added"]')!
    expect(added.textContent).toContain('Förslag 1')
    expect(added.querySelector('input')).toBeNull()
    // The rows the proposal leaves alone are written in as ever.
    expect(document.querySelector('tr[data-card-ref="wizard"] input')).not.toBeNull()
    fireEvent.click(within(strip).getByRole('button', { name: 'Dölj förslaget' }))
    await waitFor(() => expect(document.querySelector('.byd-data-compare')).toBeNull())
    expect(within(panel()).getByRole('button', { name: 'Visa i tabellen' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('is accepted as one edit of plain cell edits, and taken back in one step', async () => {
    await changeTwo()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Godta alla' }))
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits.map((e) => e.v)).toEqual(['addRow', 'setCell', 'setCell', 'setCell', 'setCell'])
    await waitFor(() => expect(proposal().textContent).toContain('Godtaget: 1 nytt kort och 2 ändrade kort.'))
    fireEvent.click(screen.getByRole('button', { name: 'Ångra det godtagna förslaget' }))
    await waitFor(async () => expect(await logged()).toHaveLength(2))
    const restored = (await logged())[1]!.intent
    expect(restored.v === 'restore' && restored.doc.rows.map((r) => [r.id, r.fields['title'], r.fields['kostnad']])).toEqual([
      ['dragon', 'Drake', 3],
      ['knight', 'Riddare', 2],
      ['wizard', 'Trollkarl', 1],
    ])
  })
})

describe('«Välj delar…»', () => {
  it('takes exactly the parts left ticked, by keyboard, as one edit and one step back', async () => {
    await ownGame()
    await openEditor()
    fireEvent.click(wallCard('dragon'))
    toTab('table')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'markera knight' }))
    await waitFor(() => expect(chips()[0]).toBe('2 markerade'))
    ask('Ändra två och lägg till två [ändra:2] [kort:2]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Välj delar…' }))
    const parts = within(proposal()).getAllByRole('checkbox')
    expect(parts.map((box) => box.getAttribute('aria-label'))).toEqual(['Ta med Förslag 1', 'Ta med Förslag 2', 'Ta med Drake', 'Ta med Riddare'])
    expect(parts.every((box) => (box as HTMLInputElement).checked)).toBe(true)
    // Where the choice is made is where the keys go.
    await waitFor(() => expect(document.activeElement).toBe(parts[0]))
    const chosen = within(proposal()).getByRole('button', { name: 'Godta valda (4)' })
    expect(chosen.classList.contains('byd-secondary')).toBe(true)
    fireEvent.click(parts[0]!)
    fireEvent.click(parts[3]!)
    expect(within(proposal()).getByRole('button', { name: 'Godta valda (2)' })).toBe(chosen)
    // The wall shows what accepting would do: only the parts still ticked.
    toTab('wall')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Visa på väggen' }))
    await waitFor(() => expect(document.querySelectorAll('.byd-wall-card[data-proposed]')).toHaveLength(1))
    expect(document.querySelectorAll('.byd-wall-card[data-changed]')).toHaveLength(1)
    expect(wallCard('knight').hasAttribute('data-changed')).toBe(false)
    fireEvent.click(chosen)
    await waitFor(async () => expect(await logged()).toHaveLength(1))
    const [line] = await logged()
    expect(line!.intent.v === 'compound' && line!.intent.edits).toEqual([
      { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Förslag 2', body: 'Text 2.', kostnad: 2, antal: 1 } },
      { v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drake II' },
      { v: 'setCell', cardRef: 'dragon', field: 'kostnad', value: 2 },
    ])
    await waitFor(() => expect(proposal().textContent).toContain('Godtaget: 1 nytt kort och 1 ändrat kort.'))
    fireEvent.click(screen.getByRole('button', { name: 'Ångra det godtagna förslaget' }))
    await waitFor(async () => expect(await logged()).toHaveLength(2))
    const restored = (await logged())[1]!.intent
    expect(restored.v === 'restore' && restored.doc.rows).toEqual(game().rows)
  })

  it('cannot accept nothing', async () => {
    await ownGame()
    await openEditor()
    ask('Två kort [kort:2]')
    fireEvent.click(await within(panel()).findByRole('button', { name: 'Välj delar…' }))
    for (const box of within(proposal()).getAllByRole('checkbox')) fireEvent.click(box)
    const none = within(proposal()).getByRole('button', { name: 'Godta valda (0)' })
    expect(none.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(none)
    expect(await logged()).toHaveLength(0)
  })

  it('is not offered for a proposal of one part', async () => {
    await ownGame()
    await openEditor()
    ask('Ett kort [kort:1]')
    await within(panel()).findByRole('button', { name: 'Godta alla' })
    expect(within(panel()).queryByRole('button', { name: 'Välj delar…' })).toBeNull()
  })
})

describe('in English', () => {
  it('speaks the reader’s language', async () => {
    await ownGame()
    await openEditor('en')
    const aside = screen.getByRole('complementary', { name: 'AI help' })
    fireEvent.click(wallCard('dragon'))
    await waitFor(() => expect([...aside.querySelectorAll('.byd-ai-chip')][0]!.textContent).toBe('selected: Drake'))
    const field = screen.getByRole('textbox', { name: 'Ask about the game' })
    fireEvent.change(field, { target: { value: 'Cheaper [ändra:1] [kort:1]' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    const group = await within(aside).findByRole('group', { name: 'Proposal · 1 new card, 1 changed card' })
    expect(within(group).getByRole('button', { name: 'Choose parts…' })).toBeTruthy()
    expect(within(group).getByRole('button', { name: 'Show on the wall' })).toBeTruthy()
    toTab('table')
    fireEvent.click(within(group).getByRole('button', { name: 'Show in the table' }))
    await waitFor(() => expect(document.querySelector('.byd-data-compare')!.textContent).toMatch(/^The AI help’s proposal/))
    expect(within(document.querySelector<HTMLElement>('.byd-data-compare')!).getByRole('button', { name: 'Hide the proposal' })).toBeTruthy()
  })
})

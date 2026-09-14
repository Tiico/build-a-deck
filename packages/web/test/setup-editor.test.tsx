// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

async function openBord(): Promise<void> {
  history.replaceState(null, '', `/editor?project=p1&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
}
const handle = (id: string) => document.querySelector(`[data-zone-handle="${id}"]`) as HTMLElement
const row = (id: string) => document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement
const rows = () => [...document.querySelectorAll('[data-zone-row]')].map((el) => el.getAttribute('data-zone-row'))

// Bordet är designerns (B5, reviderat). Listan är vägen in till varje zon — också de som ligger
// under varandra på filten, där ett handtag bakom ett annat inte ens går att träffa.
describe('the setup editor (B5, K2): the list of zones', () => {
  it('lists every zone with its own, and takes one off the table when it is removed', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    // I dokumentets egen ordning, för den ordningen betyder något: ett släpp landar i den minsta
    // zonen, och mellan lika stora i den som står först (K2).
    expect(rows()).toEqual(['draw', 'discard', 'table', 'hand:A', 'hand:B'])
    expect(row('hand:A').textContent).toMatch(/A/)

    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Kasthög' }))
    expect(rows()).toEqual(['draw', 'table', 'hand:A', 'hand:B'])
    expect(handle('discard')).toBeNull()
    expect(document.querySelector('[data-table] [data-zone="discard"]')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    expect((await run.projects.load('p1'))?.setup.zones.some((z) => z.id === 'discard')).toBe(false)
  })
})

// Tre zoner står fast, och var och en av sitt eget skäl (B5, reviderat). Leken är den enda som går
// att lösa upp: den är en roll en hög bär, inte en zon, så den kan flytta — och då går högen den
// låg i att ta bort som vilken annan som helst.
describe('the setup editor (B5, K2): what the table cannot be without', () => {
  it('says why the felt, a hand and the deck’s pile stay, and lets the deck move so its pile can go', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    expect(screen.queryByRole('button', { name: 'Ta bort Spelyta' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort Draghög' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort Hand' })).toBeNull()
    expect(row('table').textContent).toMatch(/fast/)

    fireEvent.click(within(row('draw')).getByRole('button', { name: /Draghög/ }))
    expect(screen.getByText(/Lägg leken i en annan hög först/)).toBeTruthy()
    expect(within(row('hand:A')).getByLabelText(/En plats är en hand/)).toBeTruthy()

    // En egen hög tar rollen; först då går draghögen att ta bort.
    fireEvent.click(screen.getByRole('button', { name: '＋ Hög' }))
    fireEvent.change(screen.getByLabelText('Namn för Hög 1'), { target: { value: 'Leken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lägg leken i Leken' }))
    expect(row('hog-1').textContent).toMatch(/leken/)
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Draghög' }))
    expect(handle('draw')).toBeNull()
    // Och korten ligger i den nya leken: bordet går att bygga, och högen räknar dem.
    expect(screen.queryByRole('alert')).toBeNull()
    expect(document.querySelector('[data-table] [data-zone="hog-1"]')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.setup.deckZone).toBe('hog-1')
    expect(stored?.setup.zones.filter((z) => z.kind === 'hand').map((z) => z.returnTo)).toEqual(['hog-1', 'hog-1'])
  })
})

// Filten och listan är en och samma markering: det man tar tag i på filten öppnar sin rad, och
// Delete gäller den — bunden till fönstret, eftersom ett handtag aldrig har fokus (pekaren som
// markerar det är pekaren som börjar draget).
describe('the setup editor (B5, K2): the felt, the list and the key', () => {
  it('opens the row for a zone picked on the felt, takes it away with Delete, and puts it back with Ångra', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    fireEvent.click(handle('discard'))
    expect(row('discard').getAttribute('data-open')).toBe('true')
    expect(screen.getByLabelText('Genväg för Kasthög')).toBeTruthy()

    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(row('discard')).toBeNull()
    expect(screen.getByText(/Kasthög är borttagen/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ångra' }))
    expect(row('discard')).toBeTruthy()
    expect(handle('discard')).toBeTruthy()

    // Delete i ett fält är ett tecken och inte en zon.
    fireEvent.click(handle('discard'))
    const name = screen.getByLabelText('Namn för Kasthög') as HTMLInputElement
    name.focus()
    fireEvent.keyDown(name, { key: 'Delete' })
    expect(row('discard')).toBeTruthy()

    // Och det som står fast står fast också för tangenten.
    fireEvent.click(handle('hand:A'))
    fireEvent.keyDown(document.body, { key: 'Delete' })
    expect(row('hand:A')).toBeTruthy()
  })
})

// Platsratten är det enda receptet har kvar, och den lägger inget tillbaka. Motsatsen till att ta
// bort en zon per plats är att ge platserna en igen — i ett steg, för det är en sak designern gör.
describe('the setup editor (B5, K2): the seats knob, and giving the seats a zone again', () => {
  it('lays a new seat out like the others, keeps what was removed removed, and gives every seat a zone back in one step', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort Kasthög' }))
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(screen.getByRole('button', { name: '3', pressed: true })).toBeTruthy()
    expect(row('hand:C')).toBeTruthy()
    expect(document.querySelector('[data-table] .byd-hand[data-zone="hand:C"]')).toBeTruthy()
    // Kasthögen är borta, och den kommer inte tillbaka för att någon vrider på platsantalet.
    expect(row('discard')).toBeNull()

    // En räknare utan räknarzon lägger inga brickor på bordet, och panelen säger det.
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    expect(screen.getByText(/Ingen plats har någon räknarzon/)).toBeTruthy()
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
    expect(rows()).toEqual(expect.arrayContaining(['counters:A', 'counters:B', 'counters:C']))
    expect(screen.queryByText(/Ingen plats har någon räknarzon/)).toBeNull()
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(3)

    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))
    expect(rows()).toEqual(expect.arrayContaining(['mine:A', 'mine:B', 'mine:C']))
    // Telefonens ark är en plats (C4): verbet står där en gång, inte en gång per plats.
    expect(screen.getAllByText('Framför mig', { selector: '[data-sheet-preview] span' })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.setup.zones.map((z) => z.id)).toEqual(expect.arrayContaining(['counters:C', 'mine:C', 'hand:C']))
    expect(stored?.setup.zones.some((z) => z.id === 'discard')).toBe(false)
    expect(stored?.setup.zones.find((z) => z.id === 'mine:B')).toMatchObject({ owner: 'B', visibility: 'owner' })
  })
})

// Arket bredvid bordet är telefonens, och telefonens ark är en plats (C4): en annan plats egna yta
// står aldrig på det, och en zon som bara håller räknare är ingen plats att spela ett kort till.
// Förhandsvisningen räknade upp varje plats "Framför mig" och varje räknarzon, alltså ett ark
// ingen spelare någonsin får se.
describe('the setup editor (B5, C4): the phone’s sheet as a preview', () => {
  it('shows one seat’s sheet, not every seat’s', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '3' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknarzon per plats' }))
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta per plats' }))

    const sheet = document.querySelector('[data-sheet-preview]') as HTMLElement
    expect(within(sheet).getAllByText('Framför mig')).toHaveLength(1)
    expect(within(sheet).queryByText(/Räknare [ABC]/)).toBeNull()
    expect(within(sheet).getByText('Kasta')).toBeTruthy()
    expect(within(sheet).getByText('Bordet')).toBeTruthy()
  })
})

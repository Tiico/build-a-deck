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

async function openZone(id: string): Promise<void> {
  history.replaceState(null, '', `/editor?project=${run.projectId}&server=${encodeURIComponent(run.http)}`)
  render(<EditorPage />)
  await screen.findByText('Skogens herrar')
  fireEvent.click(screen.getByRole('tab', { name: 'Bord' }))
  fireEvent.click(within(document.querySelector(`[data-zone-row="${id}"]`) as HTMLElement).getByRole('button', { name: /Draghög|Kasthög|Spelyta/ }))
}

const panel = () => document.querySelector('[data-zone-actions]') as HTMLElement

// En ny åtgärd med sitt enda steg, som är den mening rattarna sitter i.
function newStep(): HTMLElement {
  fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
  return panel().querySelector('ol li') as HTMLElement
}

// Öppnar en ratt i meningen och lämnar tillbaka rutan den fällde ut.
function open(step: HTMLElement, label: string): HTMLElement {
  fireEvent.click(within(step).getByRole('button', { name: label }))
  return step.querySelector('.byd-slot-pop') as HTMLElement
}

// Raderna man väljer bland, som de står — sökfältet och rubrikerna räknas inte.
const rows = (box: HTMLElement): string[] => [...box.querySelectorAll('.byd-slot-list button')].map((b) => b.textContent ?? '')

// Vilken sida av högen som är "bredvid den" är högens egen sak (K21, reviderar #87): den som
// lägger leken vid filtens vänsterkant vill inte ha sina kort utanför bordet. Valet sitter på
// zonen och inte i steget, för ringens Dra 1 och designerns egna åtgärder lägger samma kort.
describe('vilken sida av högen som är bredvid den', () => {
  it('väljs på högen, sparas med den, och står i meningen designern läser', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    const side = screen.getByLabelText('Bredvid högen för Draghög') as HTMLSelectElement
    expect(side.value).toBe('left')
    fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
    expect(panel().textContent).toMatch(/till vänster om högen/)

    fireEvent.change(side, { target: { value: 'right' } })
    expect(panel().textContent).toMatch(/till höger om högen/)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')?.beside).toBe('right')
  })
})

// Författandet är meningar och inte en blankett (prototypen 2026-09-15): det designern läser är
// det som kommer att hända, och rattarna sitter inne i texten.
describe('vad en zon frågar efter, skrivet som en mening', () => {
  it('säger att inga kort börjar i högen, och tar frågan när en kolumns värde väljs', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    expect(panel().textContent).toMatch(/börjar/)
    fireEvent.click(within(panel()).getByRole('button', { name: /inga kort/ }))
    fireEvent.click(within(panel()).getByRole('button', { name: 'Drake' }))
    expect(panel().textContent).toMatch(/korten där title är Drake/)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    expect((await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')?.fill).toEqual([{ field: 'title', is: ['Drake'] }])
  })
})

describe('en egen åtgärd på en hög, skriven som meningar', () => {
  it('får ett namn och ett steg, och steget läses som den mening det är', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')

    // En ny åtgärd har ett steg från början: en åtgärd utan steg är ingen åtgärd.
    fireEvent.click(within(panel()).getByRole('button', { name: '＋ Åtgärd' }))
    fireEvent.change(within(panel()).getByLabelText(/Namn för/), { target: { value: 'Vänd upp ett per spelare' } })
    // Sidan står utskriven och inte som ordet "bredvid": meningen säger vad som kommer att hända (K21).
    expect(panel().textContent).toMatch(/Ta 1 från högen och lägg dem som de ligger till vänster om högen/)

    // Antalet är en källa och inte ett tal: "ett per spelare" väljs inne i meningen.
    const step = panel().querySelector('ol li') as HTMLElement
    fireEvent.click(within(step).getByRole('button', { name: '1' }))
    fireEvent.click(within(step).getByRole('button', { name: 'ett per spelare' }))
    expect(panel().textContent).toMatch(/Ta ett per spelare från högen/)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load(run.projectId))?.rev).toBe(2))
    const zone = (await run.projects.load(run.projectId))?.setup.zones.find((z) => z.id === 'draw')
    expect(zone?.actions).toEqual([
      { id: expect.any(String), label: 'Vänd upp ett per spelare', steps: [{ v: 'split', count: { of: 'seats' }, to: { at: 'beside' }, face: 'keep' }] },
    ])
  })

  it('erbjuds bara på högar — en yta och en hand har ingen ring att hänga dem i', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('table')
    expect(document.querySelector('[data-zone-actions]')).toBeNull()
  })
})

// Ägaren i platsrutan och antalsrutan (#255). Åtta platser ger åtta zoner som heter «Hand», och
// raderna man väljer bland blir kopior av varandra: prototypen mätte 21 av 47 rader vid åtta
// platser. Efterledet är zonlistans egen bricka — `Hand` med ett dämpat `A` efter sig — och
// sammansättningen är katalogens, aldrig ytans (A4).
describe('vems zon en rad i rutan står för', () => {
  it('skiljer två zoner med samma namn åt i platsrutan', async () => {
    await run.projects.create(run.projectId, projectDoc())
    await openZone('draw')
    const step = newStep()

    const box = open(step, 'till vänster om högen')
    expect(rows(box)).toContain('Hand A')
    expect(rows(box)).toContain('Hand B')
  })
})

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorPage } from '../src/editor/EditorPage.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

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

describe('the setup editor (B5, K2): the recipe', () => {
  it('shows the recipe as it stands, lays the seats out again when the player count changes, and the table follows', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    expect(screen.getByRole('button', { name: '2', pressed: true })).toBeTruthy()
    expect((screen.getByLabelText(/en yta framför sig/) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText(/kasthög/) as HTMLInputElement).checked).toBe(true)
    // A handle on the felt for every zone but the floor, hands included.
    expect(handle('discard')).toBeTruthy()
    expect(handle('hand:B')).toBeTruthy()
    expect(handle('table')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '3' }))
    expect(screen.getByRole('button', { name: '3', pressed: true })).toBeTruthy()
    expect(handle('hand:C')).toBeTruthy()
    // The felt shows the new seat's hand too.
    expect(document.querySelector('[data-table] .byd-hand[data-zone="hand:C"]')).toBeTruthy()

    fireEvent.click(screen.getByLabelText(/en yta framför sig/))
    expect(handle('mine:C')).toBeTruthy()
    fireEvent.click(screen.getByLabelText(/marknad/))
    expect(handle('market')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.setup.seats).toEqual(['A', 'B', 'C'])
    expect(stored?.setup.zones.map((z) => z.id)).toEqual(expect.arrayContaining(['hand:C', 'mine:A', 'mine:C', 'market']))
  })
})

describe('the setup editor (B5, K2): a zone\'s properties', () => {
  it('selects a zone by its handle, edits name, shortcut and placement, previews the phone\'s sheet, and saves', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    expect(screen.queryByLabelText(/Genväg för/)).toBeNull()
    fireEvent.click(handle('discard'))
    expect(handle('discard').getAttribute('aria-pressed')).toBe('true')

    const label = screen.getByLabelText('Genväg för Kasthög') as HTMLInputElement
    expect(label.value).toBe('Kasta')
    expect(screen.getByText('Kasta', { selector: '[data-sheet-preview] span' })).toBeTruthy()
    // Without a shortcut the phone shows the name.
    fireEvent.change(label, { target: { value: '' } })
    expect(screen.getByText('Kasthög', { selector: '[data-sheet-preview] span' })).toBeTruthy()
    fireEvent.change(label, { target: { value: 'Kasta i påsen' } })
    expect(screen.getByText('Kasta i påsen', { selector: '[data-sheet-preview] span' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Placering för Kasthög'), { target: { value: 'bottom' } })
    // A recipe zone's owner and visibility are the recipe's, and it cannot be removed here.
    expect(screen.queryByLabelText('Ägare för Kasthög')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Ta bort zonen' })).toBeNull()

    fireEvent.click(handle('draw'))
    fireEvent.change(screen.getByLabelText('Namn för Draghög'), { target: { value: 'Leken' } })
    expect(screen.getByText(/underst i Leken/)).toBeTruthy()
    // The hands are handles too, but they have no verb on the phone.
    fireEvent.click(handle('hand:A'))
    expect(screen.queryByLabelText(/Genväg för Hand/)).toBeNull()
    expect(screen.getByLabelText('Namn för Hand')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.setup.zones.find((z) => z.id === 'discard')).toMatchObject({ name: 'Kasthög', shortcut: { label: 'Kasta i påsen', at: 'bottom' } })
    expect(stored?.setup.zones.find((z) => z.id === 'draw')?.name).toBe('Leken')
  })
})

describe('the setup editor (B5, K2): the designer\'s own zones', () => {
  it('adds an area and a pile, drags, resizes and nudges them in millimetres, gives one an owner, and removes one', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    fireEvent.click(screen.getByRole('button', { name: '＋ Yta' }))
    const area = handle('yta-1')
    expect(area.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Namn för Yta 1')).toBeTruthy()
    // Under jsdom the felt is unmeasured and drawn 1:1, so a pixel is a millimetre.
    expect(area.style.left).toBe('350px')
    expect(area.style.top).toBe('400px')

    fireEvent.pointerDown(area, { button: 0, clientX: 100, clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(area, { clientX: 162, clientY: 131, pointerId: 1 })
    fireEvent.pointerUp(area, { pointerId: 1 })
    expect(screen.getByText('-90, 130 · 300 × 120 mm', { selector: '[data-zone-where]' })).toBeTruthy()
    const corner = document.querySelector('[data-resize="yta-1"]') as HTMLElement
    fireEvent.pointerDown(corner, { button: 0, clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerMove(corner, { clientX: 50, clientY: 25, pointerId: 1 })
    fireEvent.pointerUp(corner, { pointerId: 1 })
    expect(screen.getByText('-90, 130 · 350 × 145 mm', { selector: '[data-zone-where]' })).toBeTruthy()
    fireEvent.keyDown(handle('yta-1'), { key: 'ArrowLeft' })
    fireEvent.keyDown(handle('yta-1'), { key: 'ArrowDown', shiftKey: true })
    expect(screen.getByText('-100, 180 · 350 × 145 mm', { selector: '[data-zone-where]' })).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Namn för Yta 1'), { target: { value: 'Altaret' } })
    fireEvent.change(screen.getByLabelText('Ägare för Altaret'), { target: { value: 'B' } })
    fireEvent.change(screen.getByLabelText('Syns för Altaret'), { target: { value: 'owner' } })
    expect(handle('yta-1').textContent).toContain('Altaret · B')

    fireEvent.click(screen.getByRole('button', { name: '＋ Hög' }))
    expect(handle('hog-1')).toBeTruthy()
    expect(screen.getByText('0, 150 mm', { selector: '[data-zone-where]' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort zonen' }))
    expect(handle('hog-1')).toBeNull()
    expect(screen.queryByLabelText(/Namn för/)).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    const stored = await run.projects.load('p1')
    expect(stored?.setup.zones.find((z) => z.id === 'yta-1')).toMatchObject({ name: 'Altaret', owner: 'B', visibility: 'owner', geometry: { x: -100, y: 180, w: 350, h: 145 } })
    expect(stored?.setup.zones.some((z) => z.id === 'hog-1')).toBe(false)
  })
})

describe('the setup editor (B5, K2): counters and a setup the engine refuses', () => {
  it('adds, edits and removes counters; their zones follow, and the preview shows each seat\'s tokens', async () => {
    await run.projects.create('p1', projectDoc())
    await openBord()
    expect(handle('counters:A')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    expect((screen.getByLabelText('Namn för räknare 1') as HTMLInputElement).value).toBe('Poäng')
    expect(handle('counters:A')).toBeTruthy()
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: '＋ Räknare' }))
    fireEvent.change(screen.getByLabelText('Namn för räknare 2'), { target: { value: 'Mynt' } })
    fireEvent.change(screen.getByLabelText('Startvärde för räknare 2'), { target: { value: '5' } })
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Ta bort räknare 1' }))
    expect(document.querySelectorAll('[data-table] [data-counter-token]')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Spara' }))
    await waitFor(async () => expect((await run.projects.load('p1'))?.rev).toBe(2))
    expect((await run.projects.load('p1'))?.setup.counters).toEqual([{ name: 'Mynt', start: 5 }])
  })

  it('says so instead of drawing a table when the setup cannot be built', async () => {
    const doc = projectDoc()
    await run.projects.create('p1', { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === 'hand:A' ? { ...z, returnTo: 'nowhere' } : z)) } })
    await openBord()
    expect(screen.getByRole('alert').textContent).toMatch(/går inte att bygga/)
    expect(document.querySelector('[data-table]')).toBeNull()
  })
})

// @vitest-environment jsdom
// Brickor på filten (#1485, variant A i #1474): brickan ritas i sin form, ringen och tangentbordet
// vrider den i formens steg, och en dold hög brickor är en hög som korten.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TILE_HEX, TILE_SQUARE } from '@byd/engine'
import type { SetupDef } from '@byd/engine'
import { TableRenderer } from '../src/table/TableRenderer.js'
import { feltLabels, feltShortcuts, shortcutIntents } from '../src/table/keyboard.js'
import { Lifted } from '../src/table/Lifted.js'
import { liftBox } from '../src/table/lift.js'
import { dropIntents, hitAt } from '../src/table/drop.js'
import { footprintOf } from '../src/components.js'
import { tableOf } from './scene.js'
import { twoSeatSetup } from './fixture.js'

const hex = { id: TILE_HEX.id, version: TILE_HEX.version }
const square = { id: TILE_SQUARE.id, version: TILE_SQUARE.version }

// The wizard's two-seat table, with a hidden bag of hexagons beside the draw pile and two tiles
// lying face up on the felt: a hexagon and a square.
export function tileSetup(): SetupDef {
  const base = twoSeatSetup()
  return {
    ...base,
    zones: [...base.zones, { id: 'bag', kind: 'pile', name: 'Landskap', visibility: 'none', geometry: { x: 0, y: -150, w: 0, h: 0, rot: 0 } }],
    components: [
      ...base.components,
      ...['Granskog', 'Tjärn', 'Fjäll'].map((cardRef) => ({ type: hex, cardRef, zone: 'bag', face: 'back' as const })),
      { type: hex, cardRef: 'Rågåker', zone: 'table', face: 'front' as const, x: 100, y: 50 },
      { type: square, cardRef: 'Vete', zone: 'table', face: 'front' as const, x: 300, y: 200 },
    ],
  }
}

const client = (mmX: number, mmY: number) => ({ clientX: mmX + 500, clientY: mmY + 300, pointerId: 1, isPrimary: true, button: 0 })
const idOf = (view: ReturnType<ReturnType<typeof tableOf>['view']>, ref: string) => view.components.find((c) => c.cardRef === ref)!.id

afterEach(cleanup)

describe('the ring turns a tile in its shape’s step (#1485, K34)', () => {
  it.each([
    ['Rågåker', '↻ Vrid 60°', 60],
    ['Rågåker', '↺ Vrid 60°', 300],
    ['Vete', '↻ Vrid 90°', 90],
    ['Vete', '↺ Vrid 90°', 270],
  ] as const)('%s: «%s» sends `rotate` to %i', (ref, label, rot) => {
    const view = tableOf(tileSetup()).view(null)
    const onAct = vi.fn()
    render(<TableRenderer view={view} mode="tv" scale={1} onAct={onAct} />)
    const tile = document.querySelector(`[data-component="${idOf(view, ref)}"]`)!
    fireEvent.pointerDown(tile, client(-370, -230))
    fireEvent.pointerUp(tile, client(-370, -230))
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(onAct).toHaveBeenLastCalledWith([{ v: 'rotate', component: idOf(view, ref), rot }])
  })
})

describe('a tile taken off a pile lands where it was carried (#1485, #223)', () => {
  it('keeps the point it was picked up by: its own corner, not a card’s', () => {
    const view = tableOf(tileSetup()).view(null)
    const grab = { x: 0, y: -150 }
    const [split] = dropIntents(view, { target: { kind: 'pileTop', pile: 'bag' }, ids: [], origin: {}, grab, at: { x: 100, y: -150 } }, 'tv')
    const h = TILE_HEX.physical.heightMm
    expect(split).toMatchObject({ v: 'split', pile: 'bag', at: 1, to: 'table' })
    // The table area's corner is (−500, −300); the bag's middle, carried 100 mm right.
    expect((split as { x: number }).x).toBeCloseTo(100 - 26 + 500, 6)
    expect((split as { y: number }).y).toBeCloseTo(-150 - h / 2 + 300, 6)
  })

  it('is stacked on only where it lies, not on a card’s box round it', () => {
    const view = tableOf(tileSetup()).view(null)
    const tile = view.components.find((c) => c.cardRef === 'Vete')!
    // Vete is a 45 mm square at (300, 200) in the table area: (−200, −100) on the felt.
    expect(hitAt(view, { x: -200 + 40, y: -100 + 40 }, new Set(), null)).toMatchObject({ kind: 'card', id: tile.id })
    expect(hitAt(view, { x: -200 + 55, y: -100 + 80 }, new Set(), null)).toBeNull()
  })
})

describe('a tile held up to be read is a tile (#1485, K8, K26)', () => {
  it('is lifted in its own proportions and in its shape, as large as the card it stands beside', () => {
    const view = tableOf(tileSetup()).view(null)
    const tile = view.components.find((c) => c.cardRef === 'Rågåker')!
    const card = { left: 100, right: 160, top: 100, bottom: 160 }
    const window = { w: 1280, h: 800 }
    const box = liftBox(card, window, null, footprintOf(tile))
    expect(box.w / box.h).toBeCloseTo(52 / ((52 * 2) / Math.sqrt(3)), 3)
    // As tall as a card held up: the window's share, which is what makes the words on it readable.
    expect(box.h).toBeCloseTo(liftBox(card, window, null).h, 3)
    render(<Lifted c={tile} box={box} faces={undefined} onAsk={() => undefined} />)
    expect(document.querySelector('.byd-lift')!.getAttribute('data-shape')).toBe('hex')
  })
})

describe('a reader hears a tile as a tile (#1485)', () => {
  it('names it when its face shows, says «bricka, baksida» when it does not, and counts the bag in tiles', () => {
    const table = tableOf(tileSetup())
    const id = idOf(table.view(null), 'Rågåker')
    table.run(null, { v: 'rotate', component: id, rot: 120 })
    table.run(null, { v: 'draw', from: 'bag', to: 'table', count: 1 })
    const view = table.view(null)
    const labels = feltLabels(view)
    const hidden = view.components.find((c) => c.zone === 'table' && c.cardRef === null)!
    expect(labels.get(`card:${id}`)).toBe('Rågåker, bricka i Spelyta, vriden 120°. Enter öppnar handlingar.')
    expect(labels.get(`card:${idOf(view, 'Vete')}`)).toBe('Vete, bricka i Spelyta. Enter öppnar handlingar.')
    expect(labels.get(`card:${hidden.id}`)).toBe('Bricka, baksida, i Spelyta. Enter öppnar handlingar.')
    expect(labels.get('pile:bag')).toBe('Landskap, 2 brickor, överst: bricka, baksida. Enter öppnar handlingar.')
  })
})

describe('a turned tile flashes its steps (#1485, variant A of #1474)', () => {
  it('shows the six steps of a hexagon round it, the one it lies at marked, and lets them go again', () => {
    vi.useFakeTimers()
    try {
      const table = tableOf(tileSetup())
      const id = idOf(table.view(null), 'Rågåker')
      const { rerender } = render(<TableRenderer view={table.view(null)} mode="tv" scale={1} />)
      expect(document.querySelector('[data-detents]')).toBeNull()
      table.run(null, { v: 'rotate', component: id, rot: 120 })
      rerender(<TableRenderer view={table.view(null)} mode="tv" scale={1} />)
      const ring = document.querySelector(`[data-detents="${id}"]`)!
      expect(ring.querySelectorAll('i')).toHaveLength(6)
      expect([...ring.querySelectorAll('i')].findIndex((i) => i.hasAttribute('data-at'))).toBe(2)
      act(() => vi.advanceTimersByTime(2000))
      expect(document.querySelector('[data-detents]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('R and Shift R turn a tile one step (#1485, K16)', () => {
  it.each([
    ['Rågåker', false, 60],
    ['Rågåker', true, 300],
    ['Vete', false, 90],
    ['Vete', true, 270],
  ] as const)('%s, shift %s: `rotate` to %i', (ref, shift, rot) => {
    const view = tableOf(tileSetup()).view(null)
    const id = idOf(view, ref)
    expect(shortcutIntents(view, shift ? 'R' : 'r', { kind: 'card', id }, shift)).toEqual([{ v: 'rotate', component: id, rot }])
  })

  it('turns a card a quarter, and names R in the felt’s help', () => {
    const table = tableOf(tileSetup())
    table.run(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const view = table.view(null)
    const card = view.components.find((c) => c.zone === 'table' && c.type.id.startsWith('card.'))!
    expect(shortcutIntents(view, 'r', { kind: 'card', id: card.id })).toEqual([{ v: 'rotate', component: card.id, rot: 90 }])
    expect(feltShortcuts().some((s) => s.press.includes('R'))).toBe(true)
  })
})

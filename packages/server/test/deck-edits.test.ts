import { describe, expect, it } from 'vitest'
import { TILE_COIN, TILE_HEX } from '@byd/engine'
import type { FaceTemplate, Template } from '@byd/template'
import { applyEdit } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { openingSetup } from '../src/recipe.js'
import { playable } from '../src/setup.js'

// Bricka 7/7 (#1487): fliken Bord lägger till brickor, och editorn får en flik per lek (#1474 A).
const HEX = { id: TILE_HEX.id, version: TILE_HEX.version }
const COIN = { id: TILE_COIN.id, version: TILE_COIN.version }
const text = (id: string, field: string): FaceTemplate['base'][number] => ({ kind: 'text', id, x: 4, y: 10, w: 40, h: 8, bind: { field }, font: { family: 'sans-serif', sizePt: 9 }, color: '#111' })
const cards: Template = { faces: { front: { base: [text('t', 'title')], variants: {} }, back: { base: [], variants: {} } } }
const lands: Template = { faces: { front: { base: [text('t', 'title')], variants: {} }, back: { base: [], variants: {} } } }
const bag = { id: 'bag', kind: 'pile' as const, name: 'Påsen', visibility: 'none' as const, geometry: { x: 300, y: 0, w: 0, h: 0, rot: 0 } }

const game = (rows: ProjectDoc['rows'], tiles: ProjectDoc['rows'] = [{ id: 'skog', fields: { title: 'Skog', antal: 3 } }]): ProjectDoc => {
  const setup = openingSetup({ players: 2, counters: [] })
  return ProjectDoc.parse({
    name: 'Skogens råd',
    template: cards,
    rows,
    icons: {},
    setup: { ...setup, zones: [...setup.zones, bag] },
    decks: [{ id: 'landskap', name: 'Landskap', type: HEX, template: lands, rows: tiles, columns: ['title', 'antal'], zone: 'bag' }],
  })
}

describe('ett spel är spelbart när någon lek har en rad (beslutet 2026-11-01 i #1470)', () => {
  it('räknar brickleken när korten saknas', () => {
    expect(playable(game([]))).toBe(true)
    expect(playable(game([], []))).toBe(false)
    expect(playable(game([], [{ id: 'skog', fields: { antal: 0 } }]))).toBe(false)
  })
})

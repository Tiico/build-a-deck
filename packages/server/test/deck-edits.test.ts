import { describe, expect, it } from 'vitest'
import { TILE_COIN, TILE_HEX } from '@byd/engine'
import type { FaceTemplate, Template } from '@byd/template'
import { applyEdit } from '../src/edits.js'
import { ProjectDoc } from '../src/projects.js'
import { openingSetup } from '../src/recipe.js'
import { playable } from '../src/setup.js'
import { changeOf, revertOf } from '../src/undo.js'

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

// Mall och Tabell redigerar en annan lek med samma redigeringar som den egna (#1487): redigeringen
// bär lekens namn i `deck`, och ändrar den lekens mall, rader och kolumner och inget av den egna.
describe('en redigering i en annan lek', () => {
  const own: ProjectDoc['rows'] = [{ id: 'k1', fields: { title: 'Drake' } }]

  it('skriver en cell, en rad och ett lager i leken den nämner och lämnar den egna orörd', () => {
    let doc = game(own)
    doc = applyEdit(doc, { v: 'setCell', deck: 'landskap', cardRef: 'skog', field: 'title', value: 'Granskog' })
    doc = applyEdit(doc, { v: 'addRow', deck: 'landskap', cardRef: 'sjo', fields: { title: 'Sjö' } })
    doc = applyEdit(doc, { v: 'addElement', deck: 'landskap', face: 'front', element: text('v', 'varde') })
    const deck = doc.decks![0]!
    expect(deck.rows).toEqual([
      { id: 'skog', fields: { title: 'Granskog', antal: 3 } },
      { id: 'sjo', fields: { title: 'Sjö' } },
    ])
    expect(deck.template.faces['front']!.base.map((e) => e.id)).toEqual(['t', 'v'])
    expect(doc.rows).toEqual(own)
    expect(doc.template).toEqual(cards)
    expect(doc).not.toHaveProperty('columns')
  })

  it('flyttar, byter namn på och tar bort en kolumn i leken', () => {
    let doc = applyEdit(game(own, [{ id: 'skog', fields: { title: 'Skog', land: 'Skog', antal: 3 } }]), { v: 'addElement', deck: 'landskap', face: 'front', element: text('l', 'land') })
    doc = applyEdit(doc, { v: 'renameField', deck: 'landskap', from: 'land', to: 'mark' })
    expect(doc.decks![0]!.rows[0]!.fields).toEqual({ title: 'Skog', mark: 'Skog', antal: 3 })
    expect(doc.decks![0]!.template.faces['front']!.base[1]).toMatchObject({ bind: { field: 'mark' } })
    doc = applyEdit(doc, { v: 'moveField', deck: 'landskap', field: 'mark', before: 'title' })
    expect(doc.decks![0]!.columns?.[0]).toBe('mark')
    doc = applyEdit(doc, { v: 'removeField', deck: 'landskap', field: 'mark' })
    expect(doc.decks![0]!.rows[0]!.fields).toEqual({ title: 'Skog', antal: 3 })
    expect(doc.rows).toEqual(own)
  })

  it('vägrar en lek som inte finns, en rad som tar en annan rads namn, och en redigering som inte hör till en lek', () => {
    expect(() => applyEdit(game(own), { v: 'setCell', deck: 'saknas', cardRef: 'skog', field: 'title', value: 'x' })).toThrow()
    expect(() => applyEdit(game([{ id: 'landskap:sjo', fields: {} }]), { v: 'addRow', deck: 'landskap', cardRef: 'sjo', fields: {} })).toThrow()
    expect(() => applyEdit(game(own), { v: 'rename', deck: 'landskap', name: 'x' } as never)).toThrow()
  })

  // Ett steg tillbaka tar bara den egna ändringen (L14): Ada skriver en cell i leken och Bo en annan,
  // och Adas steg tillbaka lämnar Bos cell, som i den egna leken.
  it('går att ångra cell för cell, med en medredigerares ändring i samma lek kvar', () => {
    const before = game(own, [{ id: 'skog', fields: { title: 'Skog' } }, { id: 'sjo', fields: { title: 'Sjö' } }])
    const ada = applyEdit(before, { v: 'setCell', deck: 'landskap', cardRef: 'skog', field: 'title', value: 'Granskog' })
    const step = changeOf(before, ada)
    const bo = applyEdit(ada, { v: 'setCell', deck: 'landskap', cardRef: 'sjo', field: 'title', value: 'Tjärn' })
    const back = revertOf(step, bo)
    if (!back.ok || !back.edit) throw new Error('no step back')
    expect(applyEdit(bo, back.edit).decks![0]!.rows.map((r) => r.fields['title'])).toEqual(['Skog', 'Tjärn'])
  })

  // En markör som Bord lägger till bär båda sidorna från början, tomma.
  it('går att ångra lager för lager på en markörs sida', () => {
    const blank = { base: [], variants: {} }
    const coins = { id: 'mynt', name: 'Guld', type: COIN, faces: { front: blank, back: blank }, count: 20, zone: 'table' }
    const before = applyEdit(game(own), { v: 'setMarkers', markers: [coins] })
    const ada = applyEdit(before, { v: 'addElement', deck: 'marker:mynt', face: 'front', element: text('v', 'varde') })
    const step = changeOf(before, ada)
    const bo = applyEdit(ada, { v: 'addElement', deck: 'marker:mynt', face: 'back', element: text('b', 'bak') })
    const back = revertOf(step, bo)
    if (!back.ok || !back.edit) throw new Error('no step back')
    const faces = applyEdit(bo, back.edit).setup.markers![0]!.faces
    expect(faces?.front?.base).toEqual([])
    expect(faces?.back?.base.map((e) => e.id)).toEqual(['b'])
  })

  // En markörs sidor ritas med Malls lager (#1487): `marker:<id>` är markörens två sidor, och den har
  // inga rader.
  it('ritar en markörs sida, och vägrar en rad i den', () => {
    const coins = { id: 'mynt', name: 'Guld', type: COIN, count: 20, zone: 'table' }
    const doc = applyEdit(game(own), { v: 'setMarkers', markers: [coins] })
    const drawn = applyEdit(doc, { v: 'addElement', deck: 'marker:mynt', face: 'front', element: text('v', 'varde') })
    expect(drawn.setup.markers![0]!.faces?.front?.base.map((e) => e.id)).toEqual(['v'])
    expect(drawn.template).toEqual(cards)
    expect(() => applyEdit(doc, { v: 'addRow', deck: 'marker:mynt', cardRef: 'x', fields: {} })).toThrow()
    expect(() => applyEdit(doc, { v: 'addElement', deck: 'marker:saknas', face: 'front', element: text('v', 'varde') })).toThrow()
  })
})

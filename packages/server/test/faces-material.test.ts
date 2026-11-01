import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, MEEPLE, TOKEN_COUNTER, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import { queueFaces, type Deck } from '../src/faces.js'

// A meeple wears its seat as its `cardRef` (#1471, L11), and a counter its name. Neither is a card:
// a row of the deck that happens to share the word must not give the piece a card's faces, title or
// words, or the meeple of seat A would be drawn and named as the card «A».
const registry = new TypeRegistry(STANDARD_TYPES)
const card = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
const deck: Deck = {
  template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } },
  rows: { A: { title: 'Ess' }, Guld: { title: 'Guldkort' } },
  icons: {},
}
const setup: SetupDef = {
  seats: ['A'],
  floor: 'table',
  zones: [{ id: 'table', kind: 'area', name: 'Bord', visibility: 'all', geometry: { x: 0, y: 0, w: 100, h: 100, rot: 0 } }],
  components: [
    { type: { id: MEEPLE.id, version: MEEPLE.version }, cardRef: 'A', zone: 'table', face: 'standing' },
    { type: { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }, cardRef: 'Guld', zone: 'table', face: 'front', counter: 3 },
  ],
}

describe('material is never compiled as a card (#1471)', () => {
  it('gives a meeple and a counter no faces, title or words of a row that shares their word', async () => {
    const out = await queueFaces(deck, setup, registry, 72, 0, async () => {})
    expect(out).toMatchObject({ faces: {}, titles: {}, texts: {}, hashes: [] })
  })

  it('still compiles the card of that row', async () => {
    const withCard = { ...setup, components: [...setup.components, { type: card, cardRef: 'A', zone: 'table', face: 'back' }] }
    const out = await queueFaces(deck, withCard, registry, 72, 0, async () => {})
    expect(out.titles).toEqual({ A: 'Ess' })
  })
})

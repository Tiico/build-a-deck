import { describe, expect, it } from 'vitest'
import { STANDARD_TYPES, TILES, isMaterial, replay, rotationStep, type ComponentTypeDef, type SetupDef } from '../src/index.js'
import { Harness, inZone, registry, twoSeatSetup } from './fixture.js'

// The tiles (#1482, #1470): cardboard pieces that behave as a card does in their own shape. The
// shapes are beställarens beslut 9 (2026-10-28): square, hexagon and round, in the sizes of the
// approved prototype (#1474). A tile turns in its shape's step (60° for the hexagon, 90° for the
// square and the round one, 2026-11-01), which is the type's to say and the screen's to use:
// `rotate` already takes any angle, so no verb is new.
const tile = (id: string) => TILES.find((t) => t.id === id)!

describe('the tile types (#1482)', () => {
  it('are standard types: a hexagon, a square and two round ones', () => {
    expect(TILES.map((t) => t.id)).toEqual(['tile.hex.52', 'tile.square.45', 'tile.round.44', 'tile.round.25'])
    for (const t of TILES) expect(STANDARD_TYPES).toContain(t)
    expect(tile('tile.hex.52').physical).toMatchObject({ shape: 'hex', widthMm: 52 })
    expect(tile('tile.hex.52').physical.heightMm).toBeCloseTo((52 * 2) / Math.sqrt(3), 2)
    expect(tile('tile.square.45').physical).toMatchObject({ shape: 'roundedRect', widthMm: 45, heightMm: 45 })
    expect(tile('tile.round.44').physical).toMatchObject({ shape: 'circle', widthMm: 44, heightMm: 44 })
    expect(tile('tile.round.25').physical).toMatchObject({ shape: 'circle', widthMm: 25, heightMm: 25 })
  })

  it('stack, shuffle and flip as a card, with a front and a back and the front as content', () => {
    for (const t of TILES) {
      expect(t.behaviours, t.id).toMatchObject({ stackable: true, shufflable: true, flippable: true, rollable: false, counter: false })
      expect(t.faces).toEqual(['front', 'back'])
      expect(t.contentFace).toBe('front')
      expect(t).not.toHaveProperty('everyFaceShows')
    }
  })

  it('are printed with a bleed, and never stock', () => {
    for (const t of TILES) {
      expect(t.print.bleedMm, t.id).toBeGreaterThan(0)
      expect(t.print.stock).toBeUndefined()
    }
  })

  // Beställarens beslut 10: a tile may be held hidden in the hand, as a card. So it is no material
  // (K32), and its type declares nothing that says otherwise.
  it('are held in a hand, as a card is (beslut 10)', () => {
    for (const t of TILES) {
      expect(t.behaviours.holdable, t.id).toBeUndefined()
      expect(isMaterial(t), t.id).toBe(false)
    }
  })

  it('turn in their shape’s step: 60° for the hexagon, 90° for the square and the round ones', () => {
    expect(rotationStep(tile('tile.hex.52'))).toBe(60)
    expect(rotationStep(tile('tile.square.45'))).toBe(90)
    expect(rotationStep(tile('tile.round.44'))).toBe(90)
    expect(rotationStep(tile('tile.round.25'))).toBe(90)
  })

  it('leave a card turning a quarter, as it always has', () => {
    for (const def of STANDARD_TYPES.filter((d) => !TILES.includes(d))) expect(rotationStep(def as ComponentTypeDef), def.id).toBe(90)
  })

  it('are known to every table', () => {
    for (const t of TILES) expect(registry.has({ id: t.id, version: t.version })).toBe(true)
  })
})

// The engine has no branch for a tile (#1482): `rotate`, `flip`, `stack`, `shuffle`, `draw` and
// `deal` read the type's behaviours, as they read a card's.
const HEX = { id: 'tile.hex.52', version: 1 }
const LANDS = ['granskog', 'ragaker', 'tjarn', 'fjall', 'blomsterang', 'bjorkhage']

// The table of the two-seat fixture with a hidden pile of hexagon tiles beside the cards (#1474's
// «påse»: a pile like the draw pile, face-down).
function withTiles(): SetupDef {
  const setup = twoSeatSetup()
  setup.zones.push({ id: 'bag', kind: 'pile', name: 'Påse', visibility: 'none', geometry: { x: 0, y: 200, w: 0, h: 0, rot: 0 } })
  for (const cardRef of LANDS) setup.components.push({ type: HEX, cardRef, zone: 'bag', face: 'back' })
  return setup
}

describe('a tile in the engine (#1482)', () => {
  it('turns to 60, 120 and 300°, and every angle stays in the log', () => {
    const h = new Harness(1, withTiles())
    h.do('A', { v: 'draw', from: 'bag', to: 'table', count: 1, face: 'front' })
    const t = inZone(h.view('A'), 'table')[0]!.id
    for (const rot of [60, 120, 300]) {
      h.do('A', { v: 'rotate', component: t, rot })
      expect(h.state.components[t]!.rot).toBe(rot)
      expect(h.view('B').components.find((c) => c.id === t)!.rot).toBe(rot)
    }
    expect(replay(h.initial, registry, h.log).components[t]!.rot).toBe(300)
  })

  it('is turned over: face-down it is nobody’s to read, face-up everyone’s', () => {
    const h = new Harness(1, withTiles())
    h.do('A', { v: 'draw', from: 'bag', to: 'table', count: 1 })
    const t = inZone(h.view('A'), 'table')[0]!.id
    expect(h.view('B').components.find((c) => c.id === t)).toMatchObject({ face: 'back', cardRef: null })
    h.do('A', { v: 'flip', component: t, face: 'front' })
    for (const seat of ['A', 'B', null]) expect(h.view(seat).components.find((c) => c.id === t)).toMatchObject({ face: 'front', cardRef: 'granskog' })
  })

  it('is stacked on another tile, and the two make a pile', () => {
    const h = new Harness(1, withTiles())
    h.do('A', { v: 'draw', from: 'bag', to: 'table', count: 2 })
    const [a, b] = h.zone('table')
    h.do('A', { v: 'stack', component: a!, onto: b! })
    expect(h.piles()).toHaveLength(1)
    expect([...h.zone(h.piles()[0]!)].sort()).toEqual([a, b].sort())
  })

  it('is shuffled in its pile and drawn out of it, and the pile keeps its count', () => {
    const h = new Harness(1, withTiles())
    h.do(null, { v: 'shuffle', pile: 'bag' })
    expect(h.zone('bag')).toHaveLength(LANDS.length)
    h.do('A', { v: 'draw', from: 'bag', to: 'table', count: 1, face: 'front' })
    expect(h.zone('bag')).toHaveLength(LANDS.length - 1)
    expect(inZone(h.view('B'), 'table')).toEqual([expect.objectContaining({ type: HEX, face: 'front', cardRef: expect.any(String) })])
  })

  // Beställarens beslut 10: a tile may be held hidden in the hand, as a card.
  it('is taken into a hand by move, draw and deal, and the hand is its owner’s alone', () => {
    const h = new Harness(1, withTiles())
    h.do('A', { v: 'draw', from: 'bag', to: 'hand:A', count: 1 })
    h.do(null, { v: 'deal', from: 'bag', to: ['hand:A', 'hand:B'], each: 1 })
    h.do('B', { v: 'draw', from: 'bag', to: 'table', count: 1 })
    h.do('B', { v: 'move', component: h.zone('table')[0]!, to: 'hand:B' })
    expect(h.zone('hand:A')).toHaveLength(2)
    expect(h.zone('hand:B')).toHaveLength(2)
    expect(inZone(h.view('A'), 'hand:A').every((c) => c.cardRef !== null)).toBe(true)
    expect(inZone(h.view('B'), 'hand:A')).toHaveLength(0)
    expect(h.view('B').zones.find((z) => z.id === 'hand:A')).toMatchObject({ mode: 'count', count: 2 })
  })

  // A stack of hexagons is a stack of hexagons to the whole room (#1485, #1474: «antal och form,
  // aldrig id eller bild»): a hidden zone says what types lie in it and how many of each, the top's
  // first, so a screen draws the bag in its shape and a hand's tiles as tiles. Nothing more.
  it('says the types a hidden zone holds, and how many of each, the top’s type first (#1485)', () => {
    const h = new Harness(1, withTiles())
    h.do('A', { v: 'draw', from: 'bag', to: 'hand:A', count: 2 })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const bag = h.view('B').zones.find((z) => z.id === 'bag')
    expect(bag).toMatchObject({ mode: 'count', count: LANDS.length - 2, types: [{ type: HEX, count: LANDS.length - 2 }] })
    const hand = h.view('B').zones.find((z) => z.id === 'hand:A')
    expect(hand).toMatchObject({ mode: 'count', count: 3, types: [{ type: { id: 'card.standard.63x88', version: 1 }, count: 1 }, { type: HEX, count: 2 }] })
    // Neither says which tile: no row, no title and no face travels with the types.
    expect(JSON.stringify(hand)).not.toMatch(/granskog|ragaker|tjarn|fjall/)
    h.do('A', { v: 'draw', from: 'bag', to: 'table', count: LANDS.length - 2 })
    expect(h.view('B').zones.find((z) => z.id === 'bag')).not.toHaveProperty('types')
  })

  it('replays to the same table, and a shuffled pile to the same order (D4)', () => {
    const h = new Harness(7, withTiles())
    h.do(null, { v: 'shuffle', pile: 'bag' })
    h.do('A', { v: 'draw', from: 'bag', to: 'table', count: 2, face: 'front' })
    const [a, b] = h.zone('table')
    h.do('A', { v: 'rotate', component: a!, rot: 120 })
    h.do('B', { v: 'flip', component: b!, face: 'back' })
    h.do('A', { v: 'stack', component: a!, onto: b! })
    h.do('B', { v: 'draw', from: 'bag', to: 'hand:B', count: 1 })
    h.do(null, { v: 'shuffle', pile: 'bag' })
    const again = replay(h.initial, registry, h.log)
    expect(again).toEqual(h.state)
    expect(again.zones['bag']!.order).toEqual(h.zone('bag'))
  })
})

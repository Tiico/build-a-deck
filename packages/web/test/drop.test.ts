import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, initialState, project } from '@byd/engine'
import type { Intent, Snapshot } from '@byd/protocol'
import { BESIDE_MM, CARD_MM, besidePile, dropIntents, type Drag, type Point } from '../src/table/drop.js'
import { zoneAt } from '../src/zones.js'
import { recipeSetup, registry } from './fixture.js'
import { buildScene } from './scene.js'

// The scene: floor `table` at (-500,-300); faceUp at (100,50) and faceDown at (300,200) in it;
// public `discard` (3) at (200,0), hidden `draw` (3) at (-200,0); hand:A at (-300,320) 600×100.
const abs = (view: Snapshot, id: string) => {
  const c = view.components.find((x) => x.id === id)!
  const z = view.zones.find((x) => x.id === c.zone)!
  return { x: z.geometry.x + c.x, y: z.geometry.y + c.y }
}
const cardDrag = (view: Snapshot, id: string, to: { x: number; y: number }): Drag => {
  const o = abs(view, id)
  const grab = { x: o.x + 10, y: o.y + 10 }
  return { target: { kind: 'card', id }, ids: [id], grab, at: { x: to.x + 10, y: to.y + 10 }, origin: { [id]: o } }
}

describe('what a drop means (K1, K2)', () => {
  it('a card onto another loose card stacks; onto a pile joins it; inside a zone moves there; elsewhere lands on the floor', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    expect(dropIntents(v, cardDrag(v, faceUp, abs(v, faceDown)))).toEqual([{ v: 'stack', component: faceUp, onto: faceDown }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: 200 - CARD_MM.w / 2, y: -CARD_MM.h / 2 }))).toEqual([{ v: 'move', component: faceUp, to: 'discard' }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: -250, y: 330 }))).toEqual([{ v: 'move', component: faceUp, to: 'hand:A', x: 50, y: 10 }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: -450, y: -250 }))).toEqual([{ v: 'move', component: faceUp, to: 'table', x: 50, y: 50 }])
  })

  it('several cards dragged together each move by the same offset, in one envelope', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    const d: Drag = { target: { kind: 'card', id: faceUp }, ids: [faceUp, faceDown], grab: { x: 0, y: 0 }, at: { x: 20, y: -30 }, origin: { [faceUp]: abs(v, faceUp), [faceDown]: abs(v, faceDown) } }
    expect(dropIntents(v, d)).toEqual([
      { v: 'move', component: faceUp, to: 'table', x: 120, y: 20 },
      { v: 'move', component: faceDown, to: 'table', x: 320, y: 170 },
    ])
  })

  it('the top of a pile onto a loose card stacks it, naming the pile rather than a card: a hidden pile has no id to give (K15)', () => {
    const { view, faceUp } = buildScene()
    const v = view(null)
    const onto = abs(v, faceUp)
    const at = { x: onto.x + 20, y: onto.y + 20 }
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'discard' }, ids: [], grab: { x: 200, y: 0 }, at, origin: {} })).toEqual([
      { v: 'stack', component: { top: 'discard' }, onto: faceUp },
    ])
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at, origin: {} })).toEqual([
      { v: 'stack', component: { top: 'draw' }, onto: faceUp },
    ])
  })

  it('the top of a pile into a hand or onto another pile is a split to that zone', () => {
    const { view } = buildScene()
    const v = view(null)
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at: { x: 0, y: 370 }, origin: {} })).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'hand:A' }])
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at: { x: 200, y: 0 }, origin: {} })).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'discard' }])
  })

  it('a whole pile moves as one unit to where it is dropped, into the area under it', () => {
    const { view } = buildScene()
    const v = view(null)
    expect(dropIntents(v, { target: { kind: 'pile', pile: 'discard' }, ids: [], grab: { x: 200, y: 30 }, at: { x: 300, y: 130 }, origin: {} })).toEqual([{ v: 'movePile', pile: 'discard', to: 'table', x: 300, y: 100 }])
  })
})

// A four-seat felt is the plain case for what a drop is aimed at: the wizard puts a hand on each
// of the four rims, all 60 mm deep and all the same distance from the middle (K18). The same
// gesture can therefore be made four times over, and the four answers ought to be one answer.
// Everything here is in the renderer's own table millimetres — the felt is 1200 × 800 mm whatever
// the window is — so no number below is pinned to a screen size.
const RIM_MM = 10
const fourSeatScene = (): Snapshot => {
  const base = recipeSetup(4)
  const loose = { type: { id: CARD_STANDARD_63x88.id, version: 1 }, cardRef: 'dragon', zone: base.floor, face: 'front' as const, x: 500, y: 300 }
  return project(initialState('rims', { ...base, components: [loose, ...base.components] }, registry), registry, null)
}
const geometryOf = (view: Snapshot, id: string) => view.zones.find((z) => z.id === id)!.geometry
const grabbedAtItsMiddle = (view: Snapshot, id: string, at: Point): Drag => {
  const o = abs(view, id)
  return { target: { kind: 'card', id }, ids: [id], grab: { x: o.x + CARD_MM.w / 2, y: o.y + CARD_MM.h / 2 }, at, origin: { [id]: o } }
}
const grabbedAtItsCorner = (view: Snapshot, id: string, at: Point): Drag => {
  const o = abs(view, id)
  return { target: { kind: 'card', id }, ids: [id], grab: { x: o.x, y: o.y }, at, origin: { [id]: o } }
}
const landedIn = (intents: Intent[]): string[] => intents.map((i) => (i.v === 'move' ? i.to : i.v === 'split' ? (i.to ?? 'the floor') : i.v))

describe('the pointer decides where a drop lands (K2, K14)', () => {
  const v = fourSeatScene()
  const loose = v.components.find((c) => c.zone === v.floor)!.id
  // Seats go S, N, E, W, so hand:A lies along the south rim of the felt, hand:B the north, hand:C
  // the east and hand:D the west. The card is let go 10 mm inside the rim at each of them, read
  // off the felt the scene actually laid out: the same gesture four times over, each time the
  // same distance into that seat's own hand.
  const felt = geometryOf(v, v.floor)
  const rims = [
    { seat: 'A', at: { x: 0, y: felt.y + felt.h - RIM_MM } },
    { seat: 'B', at: { x: 0, y: felt.y + RIM_MM } },
    { seat: 'C', at: { x: felt.x + felt.w - RIM_MM, y: 0 } },
    { seat: 'D', at: { x: felt.x + RIM_MM, y: 0 } },
  ]

  it('the point let go of lies inside that seat’s hand on every rim, which is what makes the four gestures one gesture', () => {
    expect(rims.map((r) => zoneAt(v.zones, v.floor, r.at.x, r.at.y).zone)).toEqual(['hand:A', 'hand:B', 'hand:C', 'hand:D'])
  })

  it('the same gesture at all four rims lands in the hand at that rim', () => {
    // Where in the hand the card then lies follows from where it was held, and a card is taller
    // than the band it is being put into; what that ought to look like is #65's question.
    expect(rims.map((r) => dropIntents(v, grabbedAtItsMiddle(v, loose, r.at)))).toEqual([
      [{ v: 'move', component: loose, to: 'hand:A', x: 218.5, y: 6 }],
      [{ v: 'move', component: loose, to: 'hand:B', x: 218.5, y: -34 }],
      [{ v: 'move', component: loose, to: 'hand:C', x: 18.5, y: 206 }],
      [{ v: 'move', component: loose, to: 'hand:D', x: -21.5, y: 206 }],
    ])
  })

  it('the same card held by its middle and held by a corner, let go at the same point, lands in the same zone', () => {
    // The middle of the south hand's band, which is far enough in that the card's own stored
    // corner falls outside the hand while the pointer is well inside it.
    const hand = geometryOf(v, 'hand:A')
    const at = { x: 0, y: hand.y + hand.h / 2 }
    expect(landedIn(dropIntents(v, grabbedAtItsMiddle(v, loose, at)))).toEqual(['hand:A'])
    expect(landedIn(dropIntents(v, grabbedAtItsCorner(v, loose, at)))).toEqual(['hand:A'])
  })

  it('the top of a pile is decided by the same point and answers the same at all four rims', () => {
    const draw = geometryOf(v, 'draw')
    const fromDraw = (at: Point): Drag => ({ target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: draw.x, y: draw.y }, at, origin: {} })
    expect(rims.map((r) => landedIn(dropIntents(v, fromDraw(r.at))))).toEqual([['hand:A'], ['hand:B'], ['hand:C'], ['hand:D']])
  })
})

// Where a split lands is the client's choice and travels in the intent (K14); the engine centres
// a new pile on the point and lets a pile of one settle into a card cornered there (K1). The
// pile's label is under it and on its top-right corner, so what is split off goes to its left,
// turned with the pile (#87).
describe('what is split off a pile lands beside it, clear of its label (#87)', () => {
  const pile = { x: -140, y: 0, rot: 0 }
  const across = CARD_MM.w + BESIDE_MM

  it('places a single card by its corner, so that it stands a card\'s width to the pile\'s left', () => {
    expect(besidePile(pile, 1)).toEqual({ x: Math.round(pile.x - across - CARD_MM.w / 2), y: Math.round(pile.y - CARD_MM.h / 2) })
  })

  it('places a pile by its centre, on the same line as the pile it came off', () => {
    expect(besidePile(pile, 2)).toEqual({ x: pile.x - across, y: pile.y })
  })

  it('turns with the pile: a pile turned a quarter has its left above it', () => {
    expect(besidePile({ ...pile, rot: 90 }, 2)).toEqual({ x: pile.x, y: pile.y - across })
    expect(besidePile({ ...pile, rot: 180 }, 2)).toEqual({ x: pile.x + across, y: pile.y })
    expect(besidePile({ ...pile, rot: -90 }, 1)).toEqual({ x: Math.round(pile.x - CARD_MM.w / 2), y: Math.round(pile.y + across - CARD_MM.h / 2) })
  })
})

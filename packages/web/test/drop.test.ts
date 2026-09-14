import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88, initialState, project } from '@byd/engine'
import type { Intent, Snapshot } from '@byd/protocol'
import { BESIDE_MM, CARD_MM, besidePile, dropIntents, type Drag, type Point } from '../src/table/drop.js'
import { handExtent, handRotation, type TableMode } from '../src/table/hand.js'
import { zoneAt } from '../src/zones.js'
import { playedAt } from '../src/online/seat.js'
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
    expect(dropIntents(v, cardDrag(v, faceUp, abs(v, faceDown)), 'table')).toEqual([{ v: 'stack', component: faceUp, onto: faceDown }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: 200 - CARD_MM.w / 2, y: -CARD_MM.h / 2 }), 'table')).toEqual([{ v: 'move', component: faceUp, to: 'discard' }])
    // Into a hand: on the fan it draws (#65), which is about the middle of its strip, (0, 370).
    expect(dropIntents(v, cardDrag(v, faceUp, { x: -10, y: 370 }), 'table')).toEqual([{ v: 'move', component: faceUp, to: 'hand:A', x: 290, y: 50 }])
    expect(dropIntents(v, cardDrag(v, faceUp, { x: -450, y: -250 }), 'table')).toEqual([{ v: 'move', component: faceUp, to: 'table', x: 50, y: 50 }])
  })

  it('several cards dragged together each move by the same offset, in one envelope', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    const d: Drag = { target: { kind: 'card', id: faceUp }, ids: [faceUp, faceDown], grab: { x: 0, y: 0 }, at: { x: 20, y: -30 }, origin: { [faceUp]: abs(v, faceUp), [faceDown]: abs(v, faceDown) } }
    expect(dropIntents(v, d, 'table')).toEqual([
      { v: 'move', component: faceUp, to: 'table', x: 120, y: 20 },
      { v: 'move', component: faceDown, to: 'table', x: 320, y: 170 },
    ])
  })

  it('the top of a pile onto a loose card stacks it, naming the pile rather than a card: a hidden pile has no id to give (K15)', () => {
    const { view, faceUp } = buildScene()
    const v = view(null)
    const onto = abs(v, faceUp)
    const at = { x: onto.x + 20, y: onto.y + 20 }
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'discard' }, ids: [], grab: { x: 200, y: 0 }, at, origin: {} }, 'table')).toEqual([
      { v: 'stack', component: { top: 'discard' }, onto: faceUp },
    ])
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at, origin: {} }, 'table')).toEqual([
      { v: 'stack', component: { top: 'draw' }, onto: faceUp },
    ])
  })

  it('the top of a pile into a hand or onto another pile is a split to that zone', () => {
    const { view } = buildScene()
    const v = view(null)
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at: { x: 0, y: 370 }, origin: {} }, 'table')).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'hand:A' }])
    expect(dropIntents(v, { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: -200, y: 0 }, at: { x: 200, y: 0 }, origin: {} }, 'table')).toEqual([{ v: 'split', pile: 'draw', at: 1, to: 'discard' }])
  })

  it('a whole pile moves as one unit to where it is dropped, into the area under it', () => {
    const { view } = buildScene()
    const v = view(null)
    expect(dropIntents(v, { target: { kind: 'pile', pile: 'discard' }, ids: [], grab: { x: 200, y: 30 }, at: { x: 300, y: 130 }, origin: {} }, 'table')).toEqual([{ v: 'movePile', pile: 'discard', to: 'table', x: 300, y: 100 }])
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
    expect(rims.map((r) => dropIntents(v, grabbedAtItsMiddle(v, loose, r.at), 'table'))).toEqual([
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
    expect(landedIn(dropIntents(v, grabbedAtItsMiddle(v, loose, at), 'table'))).toEqual(['hand:A'])
    expect(landedIn(dropIntents(v, grabbedAtItsCorner(v, loose, at), 'table'))).toEqual(['hand:A'])
  })

  it('the top of a pile is decided by the same point and answers the same at all four rims', () => {
    const draw = geometryOf(v, 'draw')
    const fromDraw = (at: Point): Drag => ({ target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: draw.x, y: draw.y }, at, origin: {} })
    expect(rims.map((r) => landedIn(dropIntents(v, fromDraw(r.at), 'table')))).toEqual([['hand:A'], ['hand:B'], ['hand:C'], ['hand:D']])
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

// The hand you see is the hand you drop in (K2, K9, #65): what receives a card for a hand is
// the fan as it is drawn — `handExtent`, in the renderer's own millimetres — and not the 60 mm
// strip the wizard laid under it. The fan is deeper than the strip and hangs past the rim, so a
// drop on the part of the fan that lies over the wood is still a drop into that hand.
const handWith = (held: number): Snapshot => {
  const base = recipeSetup(4)
  const card = (cardRef: string, zone: string, x = 0, y = 0) => ({ type: { id: CARD_STANDARD_63x88.id, version: 1 }, cardRef, zone, face: 'back' as const, x, y })
  const inHands = base.seats.flatMap((s) => Array.from({ length: held }, (_, i) => card(`${s}${i}`, `hand:${s}`)))
  return project(initialState('fans', { ...base, components: [card('dragon', base.floor, 500, 300), ...inHands, ...base.components] }, registry), registry, null)
}
const middleOf = (r: { x: number; y: number; w: number; h: number }): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

const inside = (r: { x: number; y: number; w: number; h: number }, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
// The seats go S, N, E, W (hand:A..D); which rim a hand is on is read off the felt, not assumed.
const RIMS = [
  { seat: 'A', rim: 'south' },
  { seat: 'B', rim: 'north' },
  { seat: 'C', rim: 'east' },
  { seat: 'D', rim: 'west' },
] as const
type Rim = (typeof RIMS)[number]['rim']

describe.each<TableMode>(['table', 'tv'])('the fan you see is the hand you drop in, mode=%s (K2, K9, #65)', (mode) => {
  const v = handWith(3)
  const loose = v.components.find((c) => c.zone === v.floor)!.id
  const floor = v.zones.find((z) => z.id === v.floor)!
  const felt = floor.geometry
  const handOf = (seat: string) => v.zones.find((z) => z.id === `hand:${seat}`)!
  const fanOf = (seat: string) => handExtent(handOf(seat), floor, handRotation(handOf(seat), floor, mode))!
  const draw = geometryOf(v, 'draw')
  const fromDraw = (at: Point): Drag => ({ target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: draw.x, y: draw.y }, at, origin: {} })
  const looseLandsIn = (at: Point) => landedIn(dropIntents(v, grabbedAtItsMiddle(v, loose, at), mode))
  const topLandsIn = (at: Point) => landedIn(dropIntents(v, fromDraw(at), mode))
  // The far edge of the felt on that rim, and the fan's own far edge past it, along the axis
  // that runs across the strip; and a step along the rim, which runs the other way.
  const across = (rim: Rim, fan: { x: number; y: number; w: number; h: number }) => {
    switch (rim) {
      case 'south':
        return { felt: felt.y + felt.h, fan: fan.y + fan.h, out: 1 }
      case 'north':
        return { felt: felt.y, fan: fan.y, out: -1 }
      case 'east':
        return { felt: felt.x + felt.w, fan: fan.x + fan.w, out: 1 }
      default:
        return { felt: felt.x, fan: fan.x, out: -1 }
    }
  }
  const along = (rim: Rim): 'x' | 'y' => (rim === 'south' || rim === 'north' ? 'x' : 'y')
  const shifted = (p: Point, rim: Rim, by: number): Point => (along(rim) === 'x' ? { x: p.x + by, y: p.y } : { x: p.x, y: p.y + by })
  const acrossPoint = (rim: Rim, fan: { x: number; y: number; w: number; h: number }, v: number): Point => (along(rim) === 'x' ? { x: fan.x + fan.w / 2, y: v } : { x: v, y: fan.y + fan.h / 2 })

  it('a drop at the middle of the south fan, as drawn, lands in that hand', () => {
    expect(looseLandsIn(middleOf(fanOf('A')))).toEqual(['hand:A'])
  })

  it('a drop on the part of the south fan that hangs past the rim lands in that hand too', () => {
    const fan = fanOf('A')
    const rim = felt.y + felt.h
    expect(fan.y + fan.h).toBeGreaterThan(rim)
    expect(looseLandsIn({ x: fan.x + fan.w / 2, y: (rim + fan.y + fan.h) / 2 })).toEqual(['hand:A'])
  })

  it.each(RIMS)('every point of the drawn fan is that hand, at the $rim rim, for a loose card and for the top of a pile alike', ({ seat, rim }) => {
    const fan = fanOf(seat)
    const edge = across(rim, fan)
    // The fan hangs past the rim on every edge, which is the strip of it the rectangle never had.
    expect((edge.fan - edge.felt) * edge.out).toBeGreaterThan(0)
    const points: Point[] = [
      middleOf(fan),
      acrossPoint(rim, fan, (edge.felt + edge.fan) / 2),
      { x: fan.x, y: fan.y },
      { x: fan.x + fan.w, y: fan.y },
      { x: fan.x, y: fan.y + fan.h },
      { x: fan.x + fan.w, y: fan.y + fan.h },
      { x: fan.x, y: fan.y + fan.h / 2 },
      { x: fan.x + fan.w, y: fan.y + fan.h / 2 },
      { x: fan.x + fan.w / 2, y: fan.y },
      { x: fan.x + fan.w / 2, y: fan.y + fan.h },
    ]
    expect(points.map(looseLandsIn)).toEqual(points.map(() => [`hand:${seat}`]))
    expect(points.map(topLandsIn)).toEqual(points.map(() => [`hand:${seat}`]))
  })

  it.each(RIMS)('the strip beside the fan at the $rim rim is felt, not hand: a loose card lands there, right up to the fan\'s edge', ({ seat, rim }) => {
    const fan = fanOf(seat)
    const strip = handOf(seat).geometry
    // Just off the fan's side, along the rim, and still well inside the 60 mm strip the wizard laid.
    for (const side of [-1, 1]) {
      const at = shifted(along(rim) === 'x' ? { x: side > 0 ? fan.x + fan.w : fan.x, y: fan.y + fan.h / 2 } : { x: fan.x + fan.w / 2, y: side > 0 ? fan.y + fan.h : fan.y }, rim, side)
      expect(inside(strip, at)).toBe(true)
      expect(inside(fan, at)).toBe(false)
      expect(looseLandsIn(at)).toEqual([v.floor])
      expect(topLandsIn(at)).toEqual(['the floor'])
    }
  })

  it.each(RIMS)('a drop just past the fan\'s far edge over the wood at the $rim rim is not the hand either', ({ seat, rim }) => {
    const fan = fanOf(seat)
    const edge = across(rim, fan)
    const at = acrossPoint(rim, fan, edge.fan + edge.out)
    expect(looseLandsIn(at)).not.toEqual([`hand:${seat}`])
  })

  it('a hand with nothing in it draws no fan, and its strip still says where it is', () => {
    const empty = handWith(0)
    const card = empty.components.find((c) => c.zone === empty.floor)!.id
    const strip = geometryOf(empty, 'hand:A')
    expect(landedIn(dropIntents(empty, grabbedAtItsMiddle(empty, card, middleOf(strip)), mode))).toEqual(['hand:A'])
  })
})

// On /online the felt draws the other seats' fans, and a card dragged up out of one's own band
// lands in what the pointer is over as it is drawn (K2, K11, K17, #65): another seat's fan is
// that seat's hand, the seat's own place on the felt is nowhere to put a card, and everything
// else is the felt, with the card centred on the pointer.
describe('a card out of the seat\'s own band lands in what the felt shows (K17, #65)', () => {
  const v = handWith(3)
  const floor = v.zones.find((z) => z.id === v.floor)!
  const fanOf = (seat: string) => handExtent(v.zones.find((z) => z.id === `hand:${seat}`)!, floor, handRotation(v.zones.find((z) => z.id === `hand:${seat}`)!, floor, 'table'))!

  it('onto another seat\'s fan, past the rim included, is into that hand', () => {
    const fan = fanOf('B')
    const rim = floor.geometry.y
    expect(playedAt(v, 'A', middleOf(fan))?.zone).toBe('hand:B')
    expect(playedAt(v, 'A', { x: fan.x + fan.w / 2, y: (rim + fan.y) / 2 })?.zone).toBe('hand:B')
  })

  it('onto the seat\'s own fan of backs goes nowhere', () => {
    expect(playedAt(v, 'A', middleOf(fanOf('A')))).toBeNull()
  })

  it('onto the felt lands there, centred on the pointer', () => {
    expect(playedAt(v, 'A', { x: 0, y: 0 })).toEqual({ zone: v.floor, x: -floor.geometry.x - CARD_MM.w / 2, y: -floor.geometry.y - CARD_MM.h / 2 })
  })
})

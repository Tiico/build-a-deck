import { describe, expect, it } from 'vitest'
import type { Snapshot, ZoneView } from '@byd/protocol'
import { CARD_MM, handBound, type Drag } from '../src/table/drop.js'
import { SEAT_BAND_MM, handBand } from '../src/table/hand.js'
import { buildScene } from './scene.js'

// Vad filten lovar medan ett kort bärs mot en hand (#444). Den frågan har ett enda svar, och det
// är samma svar som loggen får: `handBound` frågar `dropIntents` och inte punkten en andra gång,
// så en markering som säger «Ninas hand» inte kan följas av ett `move` någon annanstans.
//
// Bordet i `buildScene`: golvet `table` på (-500, -300), `hand:A` på (-300, 320) 600 × 100,
// ett uppvänt kort på (100, 50) och ett nedvänt på (300, 200), räknat i golvets koordinater.
const abs = (view: Snapshot, id: string) => {
  const c = view.components.find((x) => x.id === id)!
  const z = view.zones.find((x) => x.id === c.zone)!
  return { x: z.geometry.x + c.x, y: z.geometry.y + c.y }
}
const cardDrag = (view: Snapshot, ids: string[], to: { x: number; y: number }): Drag => {
  const first = ids[0]!
  const o = abs(view, first)
  const origin: Drag['origin'] = {}
  for (const id of ids) origin[id] = abs(view, id)
  return { target: { kind: 'card', id: first }, ids, grab: { x: o.x + 10, y: o.y + 10 }, at: { x: to.x + 10, y: to.y + 10 }, origin }
}
const zoneOf = (view: Snapshot, id: string): ZoneView => view.zones.find((z) => z.id === id)!

// Mitt på handens remsa, den punkt `drop.test.ts` redan använder för «i handen».
const ON_FAN = { x: -10, y: 370 }

describe('a card on its way into a hand (#444)', () => {
  it('names the hand a drop would land in, and nothing where it would land anywhere else', () => {
    const { view, faceUp } = buildScene()
    const v = view(null)
    expect(handBound(v, cardDrag(v, [faceUp], ON_FAN), 'table')).toEqual({ zone: 'hand:A', cards: 1 })
    // Löst på filten, i en area och på en hög: inget av det är en hand.
    expect(handBound(v, cardDrag(v, [faceUp], { x: -450, y: -250 }), 'table')).toBeNull()
    expect(handBound(v, cardDrag(v, [faceUp], { x: 200 - CARD_MM.w / 2, y: -CARD_MM.h / 2 }), 'table')).toBeNull()
  })

  it('counts what is on its way, so a hand that receives three says three', () => {
    const { view, faceUp, faceDown } = buildScene()
    const v = view(null)
    expect(handBound(v, cardDrag(v, [faceUp, faceDown], ON_FAN), 'table')).toEqual({ zone: 'hand:A', cards: 2 })
  })

  it('names the hand for the top of a pile too, which is the commonest drag on a felt', () => {
    const { view } = buildScene()
    const v = view(null)
    const pile = zoneOf(v, 'draw').geometry
    const d: Drag = { target: { kind: 'pileTop', pile: 'draw' }, ids: [], grab: { x: pile.x, y: pile.y }, at: ON_FAN, origin: {} }
    expect(handBound(v, d, 'table')).toEqual({ zone: 'hand:A', cards: 1 })
  })

  it('answers a whole pile with nothing: a pile never lands in a hand (K2)', () => {
    const { view } = buildScene()
    const v = view(null)
    const d: Drag = { target: { kind: 'pile', pile: 'draw' }, ids: [], grab: { x: 0, y: 0 }, at: ON_FAN, origin: {} }
    expect(handBound(v, d, 'table')).toBeNull()
  })
})

describe('the band along a seat’s own edge (#444)', () => {
  it('lies on the rim side of the hand’s own strip, along the whole of it', () => {
    const { view } = buildScene()
    const v = view(null)
    const hand = zoneOf(v, 'hand:A')
    const floor = zoneOf(v, v.floor)
    const g = hand.geometry
    // Handen ligger vid den södra kanten, så bandet är remsans nedre kant.
    expect(handBand(hand, floor)).toEqual({ x: g.x, y: g.y + g.h - SEAT_BAND_MM, w: g.w, h: SEAT_BAND_MM })
  })

  it('never reaches outside the strip it belongs to, whatever the strip is', () => {
    const { view } = buildScene()
    const v = view(null)
    const floor = zoneOf(v, v.floor)
    const hand = zoneOf(v, 'hand:A')
    // En remsa grundare än bandet ger ett band lika grunt som remsan och inget djupare.
    const shallow: ZoneView = { ...hand, geometry: { ...hand.geometry, h: 8 } }
    const b = handBand(shallow, floor)
    expect(b.h).toBe(8)
    expect(b.y).toBe(shallow.geometry.y)
  })

  it('takes the edge from where the seat sits, at every rim', () => {
    const { view } = buildScene()
    const v = view(null)
    const floor = zoneOf(v, v.floor)
    const hand = zoneOf(v, 'hand:A')
    const g = floor.geometry
    const at = (x: number, y: number, w: number, h: number): ZoneView => ({ ...hand, geometry: { ...hand.geometry, x, y, w, h } })
    // Norr: bandet ligger på remsans övre kant. Väster och öster: på dess yttre långsida.
    expect(handBand(at(-300, g.y, 600, 100), floor)).toEqual({ x: -300, y: g.y, w: 600, h: SEAT_BAND_MM })
    expect(handBand(at(g.x, -250, 100, 500), floor)).toEqual({ x: g.x, y: -250, w: SEAT_BAND_MM, h: 500 })
    expect(handBand(at(g.x + g.w - 100, -250, 100, 500), floor)).toEqual({ x: g.x + g.w - SEAT_BAND_MM, y: -250, w: SEAT_BAND_MM, h: 500 })
  })
})

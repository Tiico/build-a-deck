import { describe, expect, it } from 'vitest'
import { applyRecipe, emptySetup, MAX_PLAYERS, type Geometry, type Setup } from '../src/recipe.js'

// The recipe's own zones, measured against each other at every seat count the table admits (K18).
// K2 lets a designer overlap zones deliberately; nothing the recipe lays out is deliberate in that
// way, so two recipe zones sharing a millimetre is always a defect — two players' hands on the same
// spot most of all. The floor is every other zone's container and is therefore not one of the pairs.
const fullTable = (players: number): Setup =>
  applyRecipe(emptySetup(), { players, mine: true, discard: true, market: true, counters: [{ name: 'Poäng', start: 0 }] })

const sharesArea = (a: Geometry, b: Geometry): boolean =>
  Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y)

const holds = (outer: Geometry, inner: Geometry): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h

// What one seat count looks like, in the terms the defect was reported in: how large the felt is,
// how many pairs were actually looked at (a pair count of zero would make every list below pass
// for the wrong reason), which pairs share area, which zones hang off the felt, and where a pile's
// point — which has no area of its own — has landed inside somebody else's rectangle.
function measure(players: number) {
  const setup = fullTable(players)
  const floor = setup.zones.find((z) => z.id === setup.floor)!.geometry
  const zones = setup.zones.filter((z) => z.id !== setup.floor)
  const overlapping: string[] = []
  let pairs = 0
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      pairs++
      if (sharesArea(zones[i]!.geometry, zones[j]!.geometry)) overlapping.push(`${zones[i]!.id}+${zones[j]!.id}`)
    }
  }
  const outside = zones.filter((z) => !holds(floor, z.geometry)).map((z) => z.id)
  const buried = zones
    .filter((z) => z.kind === 'pile')
    .filter((p) => zones.some((z) => z.id !== p.id && z.geometry.w > 0 && holds(z.geometry, p.geometry)))
    .map((z) => z.id)
  return { felt: `${floor.w}x${floor.h}`, pairs, overlapping, outside, buried }
}

const clear = (felt: string, pairs: number) => ({ felt, pairs, overlapping: [], outside: [], buried: [] })

describe('the felt a recipe lays out (K18, B5)', () => {
  it('keeps every zone clear of every other and inside the felt, at every seat count the table admits', () => {
    const seatCounts = Array.from({ length: MAX_PLAYERS - 1 }, (_, i) => i + 2)
    expect(seatCounts).toEqual([2, 3, 4, 5, 6, 7, 8])
    expect(Object.fromEntries(seatCounts.map((n) => [n, measure(n)]))).toEqual({
      2: clear('1200x800', 36),
      3: clear('1200x800', 66),
      4: clear('1200x800', 105),
      5: clear('1800x800', 153),
      6: clear('1800x800', 210),
      7: clear('1800x1400', 276),
      8: clear('1800x1400', 351),
    })
  })

  // The alternative this rules out: narrowing the hand as the seats grow would have kept the felt
  // at 1200 x 800 without touching anything else, and given a player at an eight-seat table a
  // visibly smaller hand than a player at a four-seat one — the same game on different terms
  // depending on who happens to be playing.
  it('gives every seat the same hand, however many people sit at the table', () => {
    const widths = new Set<number>()
    for (let players = 2; players <= MAX_PLAYERS; players++) {
      for (const hand of fullTable(players).zones.filter((z) => z.kind === 'hand')) {
        widths.add(Math.max(hand.geometry.w, hand.geometry.h))
        expect(Math.min(hand.geometry.w, hand.geometry.h)).toBe(60)
      }
    }
    expect([...widths]).toEqual([500])
  })

  // What a table that already worked is worth: nothing about it changes. Up to four seats no edge
  // carries two, so the felt and every seat on it land on the millimetres they landed on before the
  // felt could grow at all.
  it('lays a table for four out exactly where it was laid out before the felt could grow', () => {
    const four = fullTable(4)
    const at = (id: string) => four.zones.find((z) => z.id === id)?.geometry
    expect(at('table')).toEqual({ x: -600, y: -400, w: 1200, h: 800, rot: 0 })
    expect(at('hand:A')).toEqual({ x: -250, y: 340, w: 500, h: 60, rot: 0 })
    expect(at('hand:B')).toEqual({ x: -250, y: -400, w: 500, h: 60, rot: 0 })
    expect(at('hand:C')).toEqual({ x: 540, y: -250, w: 60, h: 500, rot: 0 })
    expect(at('hand:D')).toEqual({ x: -600, y: -250, w: 60, h: 500, rot: 0 })
    expect(at('mine:A')).toEqual({ x: -250, y: 230, w: 380, h: 100, rot: 0 })
    expect(at('counters:A')).toEqual({ x: 140, y: 230, w: 110, h: 100, rot: 0 })
  })

  // The lift. A setup saved while five to eight seats were laid out on a 1200 x 800 mm felt carries
  // those millimetres in its own document, so it does not heal by itself. A felt too small for the
  // seats it already has is laid out again the next time the recipe is turned, even when the knob
  // that was turned was something else entirely.
  it('lays a saved table out again when its felt cannot hold the seats already sitting at it', () => {
    // A six-seat setup as it was written to disk while the felt was 1200 x 800 mm at every seat
    // count: the fifth and sixth seats shifted 300 mm along a hand 500 mm wide, so A and E shared
    // the same stretch of the south edge.
    const asItWasSaved: Setup = {
      ...fullTable(6),
      zones: fullTable(6).zones.map((z) => {
        if (z.id === 'table') return { ...z, geometry: { x: -600, y: -400, w: 1200, h: 800, rot: 0 } }
        if (z.id === 'hand:A') return { ...z, geometry: { x: -250, y: 340, w: 500, h: 60, rot: 0 } }
        if (z.id === 'hand:E') return { ...z, geometry: { x: 50, y: 340, w: 500, h: 60, rot: 0 } }
        if (z.id === 'mine:A') return { ...z, geometry: { x: -250, y: 230, w: 380, h: 100, rot: 0 } }
        if (z.id === 'mine:E') return { ...z, geometry: { x: 50, y: 230, w: 380, h: 100, rot: 0 } }
        return z
      }),
    }
    expect(sharesArea(asItWasSaved.zones.find((z) => z.id === 'hand:A')!.geometry, asItWasSaved.zones.find((z) => z.id === 'hand:E')!.geometry)).toBe(true)

    // Opening it and turning any knob at all — here the market, not the seat count — lays it out
    // again, because the felt it carries cannot hold the seats it carries.
    const opened = applyRecipe(asItWasSaved, { players: 6, mine: true, discard: true, market: false, counters: [{ name: 'Poäng', start: 0 }] })
    expect(opened.zones.find((z) => z.id === 'table')?.geometry).toEqual({ x: -900, y: -400, w: 1800, h: 800, rot: 0 })
    expect(opened.zones.find((z) => z.id === 'hand:A')?.geometry).toEqual({ x: -550, y: 340, w: 500, h: 60, rot: 0 })
    expect(opened.zones.find((z) => z.id === 'hand:E')?.geometry).toEqual({ x: 50, y: 340, w: 500, h: 60, rot: 0 })
    expect(sharesArea(opened.zones.find((z) => z.id === 'hand:A')!.geometry, opened.zones.find((z) => z.id === 'hand:E')!.geometry)).toBe(false)
  })

  // A felt the designer made roomier than the recipe asks for is theirs, and the recipe leaves it
  // alone for as long as it holds the seats.
  it('leaves a felt a designer enlarged alone while it still holds the seats', () => {
    const four = fullTable(4)
    const roomier: Setup = {
      ...four,
      zones: four.zones.map((z) => (z.id === 'table' ? { ...z, geometry: { x: -800, y: -500, w: 1600, h: 1000, rot: 0 } } : z)),
    }
    const again = applyRecipe(roomier, { players: 4, mine: true, discard: true, market: false, counters: [{ name: 'Poäng', start: 0 }] })
    expect(again.zones.find((z) => z.id === 'table')?.geometry).toEqual({ x: -800, y: -500, w: 1600, h: 1000, rot: 0 })
    expect(again.zones.find((z) => z.id === 'hand:A')?.geometry).toEqual({ x: -250, y: 340, w: 500, h: 60, rot: 0 })
  })
})

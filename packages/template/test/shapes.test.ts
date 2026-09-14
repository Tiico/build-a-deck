import { describe, expect, it } from 'vitest'
import { SHAPES, pathFor, type Rect, type ShapeName } from '../src/shapes.js'

// The rect every shape in this file is drawn into: off the origin on purpose, so a generator
// that forgets to add x or y is caught rather than passing by accident.
const rect: Rect = { x: 10, y: 20, w: 40, h: 60 }

// Every (x, y) a path visits by a move or a line. Arcs and curves are not points, so the shapes
// that use them are checked by their own tests rather than through this.
function pointsIn(d: string): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (const m of d.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)[\s,]+(-?\d+(?:\.\d+)?)/g)) out.push({ x: Number(m[1]), y: Number(m[2]) })
  return out
}

describe('the parametric core (L17): a polygon is a corner count and a turn', () => {
  it('draws a triangle with its point up, filling the box', () => {
    const points = pointsIn(pathFor('polygon', rect, { corners: 3 }))
    expect(points).toHaveLength(3)
    // The first corner is the top of the box, centred: that is what "point up" means, and it is
    // why a designer who asks for three corners gets a triangle and not a tipped-over one.
    expect(points[0]).toEqual({ x: 30, y: 20 })
    // The other two are on the bottom edge, mirrored about the middle.
    expect(points[1]!.y).toBe(80)
    expect(points[2]!.y).toBe(80)
    expect(points[1]!.x + points[2]!.x).toBeCloseTo(60, 6)
  })

  it('draws a four-cornered polygon as a diamond, and the same one turned as a square', () => {
    expect(pointsIn(pathFor('polygon', rect, { corners: 4 }))).toEqual([
      { x: 30, y: 20 },
      { x: 50, y: 50 },
      { x: 30, y: 80 },
      { x: 10, y: 50 },
    ])
    // A turn of half a corner's spacing puts the corners at the box's own corners — and the
    // shape still fills the box, which is the whole of the rule below.
    for (const p of pointsIn(pathFor('polygon', rect, { corners: 4, rotationDeg: 45 }))) {
      expect([10, 50]).toContain(Math.round(p.x))
      expect([20, 80]).toContain(Math.round(p.y))
    }
  })

  // The box is what the designer drags, what the handles hang on and what the guides snap to.
  // A shape that stops short of it points those at the card's paper instead of at itself — the
  // same reason a picture fills its frame (L1, 2026-09-12). So the shape is fitted to the box,
  // not inscribed in a circle inside it: every corner count and every turn touches all four
  // edges.
  it.each([3, 4, 5, 6, 7, 8, 12])('fills the box with %i corners at any turn', (corners) => {
    for (const rotationDeg of [0, 13, 45, 90, 180]) {
      const points = pointsIn(pathFor('polygon', rect, { corners, rotationDeg }))
      expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(10, 6)
      expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(50, 6)
      expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(20, 6)
      expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(80, 6)
    }
  })

  it('draws a star as tips and valleys in turn, the valleys at the depth asked for', () => {
    const star = (innerRatio: number) => pointsIn(pathFor('star', rect, { corners: 5, innerRatio }))
    // Five points is ten corners: a tip and a valley each, the first tip at the top.
    expect(star(0.5)).toHaveLength(10)
    expect(star(0.5)[0]).toEqual({ x: 30, y: 20 })
    // The valley straight below that tip is the sixth corner. A smaller ratio is a deeper cut,
    // so it sits nearer the middle; that is the whole meaning of the number.
    expect(star(0.3)[5]!.x).toBeCloseTo(30, 6)
    expect(star(0.3)[5]!.y).toBeLessThan(star(0.6)[5]!.y)
  })
})

describe('the shapes that were always there keep their geometry', () => {
  it('draws a rectangle as its four corners', () => {
    expect(pointsIn(pathFor('rect', rect))).toEqual([
      { x: 10, y: 20 },
      { x: 50, y: 20 },
      { x: 50, y: 80 },
      { x: 10, y: 80 },
    ])
  })

  it('draws a rounded rectangle with arcs of the radius asked for', () => {
    expect(pathFor('rect', rect, { radiusMm: 5 })).toContain('A 5 5')
  })

  // A radius past half the short side is not a mistake to report; it is a capsule, which is
  // exactly what the gallery's capsule asks for by naming a radius bigger than the box.
  it('clamps a radius larger than the box to half the short side', () => {
    expect(pathFor('rect', rect, { radiusMm: 999 })).toContain('A 20 20')
  })

  it('draws a line through the middle of the box, and leaves it open', () => {
    const d = pathFor('line', rect)
    expect(pointsIn(d)).toEqual([
      { x: 10, y: 50 },
      { x: 50, y: 50 },
    ])
    // A line is the one shape with no inside: closing it would let a fill paint a nothing.
    expect(d).not.toContain('Z')
  })

  it('draws a circle as an ellipse filling the box', () => {
    expect(pathFor('circle', rect)).toContain('A 20 30')
  })
})

describe('the named shapes of the gallery', () => {
  it('points the arrow to the right, with a shaft and a head', () => {
    const points = pointsIn(pathFor('arrow', rect))
    const tip = points.reduce((a, b) => (b.x > a.x ? b : a))
    expect(tip).toEqual({ x: 50, y: 50 })
  })

  it('cuts the banner tail into its bottom edge', () => {
    // The notch is a point on the middle line, above the bottom edge and below the halfway mark.
    expect(pointsIn(pathFor('banner', rect)).some((p) => p.x === 30 && p.y > 50 && p.y < 80)).toBe(true)
  })

  it('brings the shield to a point at the bottom middle', () => {
    expect(pathFor('shield', rect)).toContain('30 80')
  })
})

describe('no shape leaves the box it was given', () => {
  it.each(SHAPES)('keeps %s inside its rect', (shape: ShapeName) => {
    const d = pathFor(shape, rect, { corners: 6, innerRatio: 0.45, radiusMm: 4 })
    const points = pointsIn(d)
    expect(points.length).toBeGreaterThan(0)
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(rect.x - 1e-6)
      expect(p.x).toBeLessThanOrEqual(rect.x + rect.w + 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(rect.y - 1e-6)
      expect(p.y).toBeLessThanOrEqual(rect.y + rect.h + 1e-6)
    }
  })
})

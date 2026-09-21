import { describe, expect, it } from 'vitest'
import { ShapeElement } from '../src/model.js'
import { pathFor, pointsOf } from '../src/shapes.js'

// A shape of the designer's own (L26, #309): a point list in the card's millimetres, relative to
// the element's box. The gallery stays the door in; this is the room behind it.
const banner = { kind: 'shape' as const, id: 'band', x: 5, y: 5, w: 40, h: 20, shape: 'banner' as const }

describe('a shape may be a point list of its own (L26)', () => {
  it('takes a list of points in the element box own millimetres', () => {
    const parsed = ShapeElement.parse({ ...banner, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }] })
    expect(parsed.points).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }])
  })

  // Every template written before the field existed is still a template, and reads back with no
  // point list at all rather than with an empty one.
  it('leaves a shape that never had one without it', () => {
    expect(ShapeElement.parse(banner).points).toBeUndefined()
  })

  // Two points are a line and not a shape (L26), and the document is where that floor is kept:
  // an editor that lets the last-but-one point go would otherwise write a shape nothing can draw.
  it('refuses fewer than three points', () => {
    expect(ShapeElement.safeParse({ ...banner, points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }).success).toBe(false)
  })
})

describe('the one generator draws a point list too (L26)', () => {
  // The list is the outline, and it overrules the gallery entry it was written out of: the entry
  // is kept so the designer can go back to it, not so two answers can disagree about the card.
  it('closes the path through the points and ignores the entry it came from', () => {
    const d = pathFor('banner', { x: 0, y: 0, w: 40, h: 20 }, { points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }] })
    expect(d).toBe('M 0 0 L 40 0 L 20 20 Z')
  })

  // The stroke inset is the reason the rect the path is drawn into is not always the element's
  // own box: a line straddles the path it is drawn on, so the compiler hands in a smaller rect
  // and the outline has to come with it.
  it('maps the points from the box they were written in onto the rect it is given', () => {
    const points = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }]
    const d = pathFor('banner', { x: 1, y: 1, w: 38, h: 19 }, { points, pointsBox: { w: 40, h: 20 } })
    expect(d).toBe('M 1 1 L 39 1 L 20 20 Z')
  })
})

describe('writing a gallery shape out as the points it already consists of (L26)', () => {
  const box = { x: 0, y: 0, w: 45, h: 20 }

  // The first step through the one-way door changes nothing about the card. It is the whole
  // promise of «anpassa punkterna»: the designer gets the outline she was already looking at,
  // and nothing to undo before she can start shaping it.
  it.each([
    ['banner', {}],
    ['arrow', {}],
    ['rect', { radiusMm: 0 }],
    ['polygon', { corners: 6, rotationDeg: 30 }],
    ['star', { corners: 5, innerRatio: 0.45 }],
  ] as const)('draws %s exactly as it was drawn before', (shape, geom) => {
    const points = pointsOf(shape, box, geom)
    expect(points).not.toBeNull()
    expect(pathFor(shape, box, { points: points ?? [] })).toBe(pathFor(shape, box, geom))
  })

  // An outline with an arc or a curve in it does not consist of points, and a point list that
  // only looked like one would be a door that quietly changed the card on the way through.
  it.each([['circle', {}], ['line', {}], ['shield', {}], ['rect', { radiusMm: 3 }]] as const)('refuses %s, which is not a point list', (shape, geom) => {
    expect(pointsOf(shape, box, geom)).toBeNull()
  })
})

// A curve is drawn out of the edge (L38, #327): every point may carry an in- and an out-handle,
// and a point with neither is a corner. The handles are offsets from the point itself, so a
// point that is moved takes its curve with it.
describe('a point may carry handles, and a point with none is a corner (L38)', () => {
  const corners = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 20 }]

  it('takes an in- and an out-handle on a point, in millimetres from it', () => {
    const parsed = ShapeElement.parse({ ...banner, points: [{ x: 0, y: 0, out: { dx: 8, dy: 4 } }, { x: 40, y: 0, in: { dx: -8, dy: 4 } }, { x: 20, y: 20 }] })
    expect(parsed.points?.[0]?.out).toEqual({ dx: 8, dy: 4 })
    expect(parsed.points?.[1]?.in).toEqual({ dx: -8, dy: 4 })
    expect(parsed.points?.[2]?.out).toBeUndefined()
  })

  // The whole of what makes the addition backwards compatible: a template written before the
  // handles existed draws byte for byte what it drew before, because a side with no handle at
  // either end is the straight line it always was — and not a curve whose controls happen to
  // lie on its ends.
  it('draws a shape with no handles byte for byte as the polygon it was', () => {
    expect(pathFor('banner', { x: 0, y: 0, w: 40, h: 20 }, { points: corners })).toBe('M 0 0 L 40 0 L 20 20 Z')
  })

  // The handle is what the side reads, and it reads the out of the point it leaves and the in
  // of the point it arrives at. Only the side that has one is a curve; the others stay lines.
  it('bends only the side whose ends carry a handle', () => {
    const points = [{ x: 0, y: 0, out: { dx: 10, dy: -6 } }, { x: 40, y: 0, in: { dx: -10, dy: -6 } }, { x: 20, y: 20 }]
    expect(pathFor('banner', { x: 0, y: 0, w: 40, h: 20 }, { points })).toBe('M 0 0 C 10 -6 30 -6 40 0 L 20 20 Z')
  })

  // The side that closes the outline is a side like any other, and a curve on it has to be
  // written out before the Z rather than left to the straight line Z draws.
  it('bends the closing side too', () => {
    const points = [{ x: 0, y: 0, in: { dx: -4, dy: -2 } }, { x: 40, y: 0 }, { x: 20, y: 20, out: { dx: -6, dy: 2 } }]
    expect(pathFor('banner', { x: 0, y: 0, w: 40, h: 20 }, { points })).toBe('M 0 0 L 40 0 L 20 20 C 14 22 -4 -2 0 0 Z')
  })

  // The stroke inset shrinks the rect the outline is drawn into, and a handle that stood still
  // while its point moved would bend a different curve than the designer drew.
  it('scales the handles into the rect along with the points they hang on', () => {
    const points = [{ x: 0, y: 0, out: { dx: 20, dy: 0 } }, { x: 40, y: 0, in: { dx: -20, dy: 0 } }, { x: 20, y: 20 }]
    const d = pathFor('banner', { x: 0, y: 0, w: 20, h: 10 }, { points, pointsBox: { w: 40, h: 20 } })
    expect(d).toBe('M 0 0 C 10 0 10 0 20 0 L 10 10 Z')
  })
})

import { describe, expect, it } from 'vitest'
import { pathFor } from '@byd/template'
import { galleryIdOf, ownPoints, shapeChoice, SHAPE_GALLERY, type Shape } from '../src/editor/shapes.js'
import { afterPruning, bendStarted, bentEdge, bentPoints, edgeAt, grownPoint, handleAt, midpoints, movedHandle, movedPoint, prunedPoint, straightAll, straightPoint, type Point } from '../src/editor/points.js'

// A shape of the designer's own (L26, #309). The gallery is the door in and stays the starting
// point; what lies behind it is a point list in the element box's own millimetres.
const shape = (over: Partial<Shape> = {}): Shape => ({ kind: 'shape', id: 'band', x: 5, y: 5, w: 45, h: 20, shape: 'banner', ...over })

describe('the one-way door into a shape of the designer own (L26)', () => {
  // The first step changes nothing about the card: the designer is handed the outline she was
  // already looking at, and has nothing to undo before she can start shaping it.
  it('writes the gallery shape out as the points it already consists of, unchanged', () => {
    const el = shape({ shape: 'polygon', corners: 6, rotationDeg: 30 })
    const points = ownPoints(el)?.points
    expect(points).toBeDefined()
    const box = { x: 0, y: 0, w: el.w, h: el.h }
    expect(pathFor(el.shape, box, { points })).toBe(pathFor(el.shape, box, el))
  })

  // An outline drawn with an arc or a curve does not consist of points, so the door is not there
  // to be walked through: offering it would quietly redraw the card on the way.
  it('is not offered on an outline that is not a point list', () => {
    expect(ownPoints(shape({ shape: 'circle' }))).toBeNull()
    expect(ownPoints(shape({ shape: 'rect', radiusMm: 3 }))).toBeNull()
  })

  // Once the shape is the designer's own, the gallery has nothing to say it is: every entry is
  // a corner count and a turn, and her outline is neither.
  it('leaves the gallery with no entry pressed once the shape is her own', () => {
    expect(galleryIdOf(shape({ shape: 'polygon', corners: 6, rotationDeg: 0 }))).toBe('hexagon')
    expect(galleryIdOf(shape({ shape: 'polygon', corners: 6, rotationDeg: 0, points: [{ x: 0, y: 0 }, { x: 45, y: 0 }, { x: 22, y: 20 }] }))).toBeNull()
  })

  // The gallery stays the way back: pressing an entry is choosing that outline whole (L17), and
  // a point list left behind under it would go on overruling the entry the designer just picked.
  it('takes the point list away again when an entry is pressed', () => {
    const entry = SHAPE_GALLERY.find((e) => e.id === 'hexagon')!
    const patch = shapeChoice(entry, shape({ points: [{ x: 0, y: 0 }, { x: 45, y: 0 }, { x: 22, y: 20 }] }))
    expect('points' in patch).toBe(true)
    expect(patch.points).toBeUndefined()
  })
})

// The work on the points themselves (L26), kept framework-free so it can be checked without a
// DOM: where the hollow mid-dots sit, what the edge answers to, and what a gesture leaves behind.
describe('the points and the mid-dots between them (L26)', () => {
  const square = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }]

  // One per edge and the last one closes the outline: a mid-dot that stopped before the edge
  // from the last point back to the first would leave one edge of every shape without a way in.
  it('carries a mid-dot on every edge, the closing one included', () => {
    expect(midpoints(square)).toEqual([{ x: 20, y: 0 }, { x: 40, y: 10 }, { x: 20, y: 20 }, { x: 0, y: 10 }])
  })

  // The edge has a hit area wider than it looks (L26): ±1.5 mm was measured in the prototype and
  // a click aimed at the middle of the edge missed it. 2.4 mm is the floor.
  it('answers to a press up to 2.4 mm from the edge, and to nothing further out', () => {
    expect(edgeAt(square, { x: 12, y: 2 })).toMatchObject({ edge: 0, at: { x: 12, y: 0 } })
    expect(edgeAt(square, { x: 12, y: 2.39 })).not.toBeNull()
    expect(edgeAt(square, { x: 12, y: 3 })).toBeNull()
  })

  // Which edge, when two are within reach: the nearer one, so a press in a corner is about the
  // edge it is closest to and not about whichever happens to be first in the list.
  it('takes the nearest edge when two are within reach', () => {
    expect(edgeAt(square, { x: 1, y: 2 })?.edge).toBe(3)
    expect(edgeAt(square, { x: 2, y: 1 })?.edge).toBe(0)
  })
})

describe('what a gesture on a point leaves behind (L26)', () => {
  const square = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }]
  const box = { w: 40, h: 20 }

  it('moves the point that was taken hold of and leaves every other one where it was', () => {
    expect(movedPoint(square, 1, { x: 30, y: 5 }, box)).toEqual([{ x: 0, y: 0 }, { x: 30, y: 5 }, { x: 40, y: 20 }, { x: 0, y: 20 }])
  })

  // The box is what the designer drags, what the corner handles hang on and what the guides snap
  // to (L17), and the renderer draws the outline inside it. A point pulled past the box would be
  // clipped on the card and show up nowhere in the editor's numbers, so it stops at the edge.
  it('keeps a point inside the box it belongs to', () => {
    expect(movedPoint(square, 0, { x: -9, y: 33 }, box)).toContainEqual({ x: 0, y: 20 })
  })

  // The mid-dot dragged out becomes a real point in the same gesture, and it lands between the
  // two points whose edge carried it — anywhere else and the outline would cross itself.
  it('grows a new point out of a mid-dot, between the two points its edge joins', () => {
    expect(grownPoint(square, 0, { x: 20, y: 7 }, box)).toEqual([{ x: 0, y: 0 }, { x: 20, y: 7 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }])
    // The closing edge is an edge like any other: its new point comes last, after the last point.
    expect(grownPoint(square, 3, { x: 3, y: 10 }, box).at(-1)).toEqual({ x: 3, y: 10 })
  })

  it('takes a point away, and refuses when three are all that is left', () => {
    expect(prunedPoint(square, 2)).toEqual([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 20 }])
    expect(prunedPoint([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: 20 }], 1)).toBeNull()
  })

  // Delete moves the focus to the neighbour (L26). The one after, so deleting several in a row
  // walks forward through the outline; the last point hands the focus back to the new last one
  // rather than to a point that is no longer there.
  it('hands the focus to the neighbour of the point it took away', () => {
    expect(afterPruning(square, 1)).toBe(1)
    expect(afterPruning(square, 3)).toBe(2)
  })
})

// The curve drawn out of the edge (L38, #327). Framework-free arithmetic like the rest of the
// point work: what a bend leaves behind is checkable without a DOM.
describe('bending a side of an own shape (L38)', () => {
  const box = { w: 40, h: 20 }
  const square: Point[] = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }]

  // The curve follows the pointer: what is taken hold of is what changes. A cubic whose two
  // controls share one offset passes through its own middle at three quarters of that offset,
  // so the offset the side is given is four thirds of how far the pointer left the chord.
  it('puts the middle of the side where the pointer is', () => {
    const bent = bentEdge(square, 0, { x: 20, y: 6 }, box)
    expect(bent[0]?.out).toEqual({ dx: 0, dy: 8 })
    expect(bent[1]?.in).toEqual({ dx: 0, dy: 8 })
    expect(pointOnEdge(bent, 0)).toEqual({ x: 20, y: 6 })
  })

  // A handle belongs to the side it bends, and only the two arms that side reads are written:
  // the sides on either side of it are still the straight lines they were.
  it('leaves the other sides and the other arms alone', () => {
    const bent = bentEdge(square, 0, { x: 20, y: 6 }, box)
    expect(bent[0]?.in).toBeUndefined()
    expect(bent[1]?.out).toBeUndefined()
    expect(bent[2]).toEqual({ x: 40, y: 20 })
  })

  // A cubic lies inside the four-cornered hull its controls span, and the renderer clips the
  // outline to the element's box — so a control outside the box is a curve cut off on the card.
  // The box wins, here as it does for the points themselves (L26).
  it('keeps the controls inside the box the outline is drawn in', () => {
    const bent = bentEdge(square, 2, { x: 20, y: 40 }, box)
    expect(bent[2]?.out).toEqual({ dx: 0, dy: 0 })
    expect(bent[3]?.in).toEqual({ dx: 0, dy: 0 })
  })
})

describe('the handles of one point (L38)', () => {
  const box = { w: 40, h: 20 }
  const bent: Point[] = [{ x: 0, y: 10, out: { dx: 0, dy: 8 } }, { x: 20, y: 6, in: { dx: 0, dy: 4 }, out: { dx: 6, dy: 0 } }, { x: 40, y: 18 }]

  it('says where a handle stands, and says nothing for a point that carries none', () => {
    expect(handleAt(bent, 1, 'in')).toEqual({ x: 20, y: 10 })
    expect(handleAt(bent, 2, 'out')).toBeNull()
  })

  // Mirroring is the default: the opposite arm follows equally far the other way, so the curve
  // runs evenly through the point instead of breaking at it.
  it('carries the opposite handle equally far the other way', () => {
    const moved = movedHandle(bent, 1, 'out', { x: 26, y: 10 }, box, true)
    expect(moved[1]?.out).toEqual({ dx: 6, dy: 4 })
    expect(moved[1]?.in).toEqual({ dx: -6, dy: -4 })
  })

  // Alt during the drag breaks the mirroring for that handle only — the other arm stays exactly
  // where the designer last put it.
  it('leaves the opposite handle alone when the mirroring is broken', () => {
    const moved = movedHandle(bent, 1, 'out', { x: 26, y: 10 }, box, false)
    expect(moved[1]?.out).toEqual({ dx: 6, dy: 4 })
    expect(moved[1]?.in).toEqual({ dx: 0, dy: 4 })
  })

  // A cubic lies inside the hull its four controls span, and the renderer clips the outline to
  // the element's box — so a control outside the box is a curve cut off on the card. The box
  // wins over the arm exactly as it wins over the point (L26), and it wins over the mirror too:
  // a point lying on the edge of its own box is the ordinary case, not a corner one.
  it('keeps the handle inside the box, as the point itself is kept', () => {
    expect(movedHandle(bent, 1, 'out', { x: 60, y: -10 }, box, false)[1]?.out).toEqual({ dx: 20, dy: -6 })
  })

  // «Räta ut punkten» and «Räta ut alla»: the point becomes a corner again, and the shape a
  // polygon. A point list with no handle left is exactly the list L26 wrote.
  it('straightens one point and the whole shape', () => {
    expect(straightPoint(bent, 1)).toEqual([{ x: 0, y: 10, out: { dx: 0, dy: 8 } }, { x: 20, y: 6 }, { x: 40, y: 18 }])
    expect(straightAll(bent)).toEqual([{ x: 0, y: 10 }, { x: 20, y: 6 }, { x: 40, y: 18 }])
    expect(bentPoints(straightAll(bent))).toBe(false)
    expect(bentPoints(bent)).toBe(true)
  })
})

describe('a press on a mid-dot is a click until it is a drag (L38)', () => {
  // Four device pixels is a floor and not a taste: a hand resting on a trackpad always moves
  // some pixel, and nothing about the gesture is decided until the threshold is passed.
  it('holds a press back until it has travelled four pixels', () => {
    expect(bendStarted({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(false)
    expect(bendStarted({ x: 0, y: 0 }, { x: 0, y: 3.9 })).toBe(false)
    expect(bendStarted({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(true)
    expect(bendStarted({ x: 10, y: 10 }, { x: 40, y: 10 })).toBe(true)
  })
})

// Where the middle of a side actually falls, which is what «the curve follows the pointer» means.
function pointOnEdge(points: Point[], edge: number): Point {
  const from = points[edge]!
  const to = points[(edge + 1) % points.length]!
  const c1 = { x: from.x + (from.out?.dx ?? 0), y: from.y + (from.out?.dy ?? 0) }
  const c2 = { x: to.x + (to.in?.dx ?? 0), y: to.y + (to.in?.dy ?? 0) }
  const at = (a: number, b: number, c: number, d: number) => (a + 3 * b + 3 * c + d) / 8
  return { x: at(from.x, c1.x, c2.x, to.x), y: at(from.y, c1.y, c2.y, to.y) }
}

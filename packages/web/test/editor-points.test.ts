import { describe, expect, it } from 'vitest'
import { pathFor } from '@byd/template'
import { galleryIdOf, ownPoints, shapeChoice, SHAPE_GALLERY, type Shape } from '../src/editor/shapes.js'
import { afterPruning, edgeAt, grownPoint, midpoints, movedPoint, prunedPoint } from '../src/editor/points.js'

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
  const box = { w: 40, h: 20 }

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

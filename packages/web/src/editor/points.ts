// A shape of the designer's own, as the canvas works on it (L26, #309). Framework-free like
// `canvas` and `shapes` beside it: the point list is arithmetic in the card's own millimetres,
// and the canvas is a thin consumer, so what a gesture leaves behind can be checked without a
// DOM and without a browser.
import type { Point } from '@byd/template'

export type { Point }

// How far off the edge a press still counts as a press on it. Measured in the prototype: at
// ±1,5 mm — what ±7 px on a card drawn at 4,6 px/mm comes to — a click aimed at the middle of
// the edge missed it, and the edge was narrower than the point it competes with. 2,4 mm is the
// floor the decision sets (L26), and the point always lies above the edge in the hit order so
// that a press near a point is never an accidental new one.
export const EDGE_HIT_MM = 2.4

// Two points are a line and not a shape (L26).
export const LEAST_POINTS = 3

// The hollow mid-dot each edge carries, which becomes a real point when it is dragged out. One
// per edge, the closing edge from the last point back to the first included — that edge is an
// edge like any other, and a shape with no way in along it would be a hole in the gesture.
export function midpoints(points: readonly Point[]): Point[] {
  return points.map((p, i) => {
    const next = points[(i + 1) % points.length] ?? p
    return { x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 }
  })
}

// The edge a press is on, and where on it, or nothing when the press is out over the fill. The
// nearest edge wins: a press in a corner is about the edge it is closest to, not about whichever
// edge the list happens to mention first.
export function edgeAt(points: readonly Point[], at: Point, hitMm: number = EDGE_HIT_MM): { edge: number; at: Point } | null {
  let best: { edge: number; at: Point; away: number } | null = null
  for (let i = 0; i < points.length; i++) {
    const from = points[i]
    const to = points[(i + 1) % points.length]
    if (!from || !to) continue
    const on = nearestOn(from, to, at)
    const away = Math.hypot(at.x - on.x, at.y - on.y)
    if (away <= hitMm && (best === null || away < best.away)) best = { edge: i, at: on, away }
  }
  return best === null ? null : { edge: best.edge, at: best.at }
}

// The point on the segment closest to the one asked about — the press projected onto the edge,
// and never off either end of it.
function nearestOn(from: Point, to: Point, at: Point): Point {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const len = dx * dx + dy * dy
  if (len === 0) return { x: from.x, y: from.y }
  const t = Math.min(1, Math.max(0, ((at.x - from.x) * dx + (at.y - from.y) * dy) / len))
  return { x: from.x + t * dx, y: from.y + t * dy }
}

// A point moved to where the pointer is, kept inside the box it belongs to. The box is what the
// designer drags, what the corner handles hang on and what the guides snap to (L17), and the
// renderer draws the outline inside it — a point pulled past the box would be clipped on the
// card and appear nowhere in the editor's own numbers.
export function movedPoint(points: readonly Point[], index: number, to: Point, box: { w: number; h: number }): Point[] {
  return points.map((p, i) => (i === index ? inside(to, box) : p))
}

// The mid-dot dragged out, which is a real point in the same gesture (L26, variant C). It lands
// between the two points whose edge carried it: anywhere else in the list and the outline would
// cross itself while the designer was still holding it.
export function grownPoint(points: readonly Point[], edge: number, to: Point, box: { w: number; h: number }): Point[] {
  const next = [...points]
  next.splice(edge + 1, 0, inside(to, box))
  return next
}

// A point taken away, or nothing at all when three are all that is left: a shape with two points
// is a line and not a shape (L26).
export function prunedPoint(points: readonly Point[], index: number): Point[] | null {
  if (points.length <= LEAST_POINTS) return null
  return points.filter((_, i) => i !== index)
}

// Where the focus goes once a point is gone (L26). The neighbour after it, so deleting several
// in a row walks forward along the outline; the last point hands the focus to the new last one
// rather than to a place where there is no longer a point.
export function afterPruning(points: readonly Point[], index: number): number {
  return Math.max(0, Math.min(index, points.length - 2))
}

function inside(at: Point, box: { w: number; h: number }): Point {
  return { x: Math.min(box.w, Math.max(0, at.x)), y: Math.min(box.h, Math.max(0, at.y)) }
}

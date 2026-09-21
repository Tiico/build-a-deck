// A shape of the designer's own, as the canvas works on it (L26, #309). Framework-free like
// `canvas` and `shapes` beside it: the point list is arithmetic in the card's own millimetres,
// and the canvas is a thin consumer, so what a gesture leaves behind can be checked without a
// DOM and without a browser.
import type { Point } from '@byd/template'
import { round } from './canvas.js'

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

// How far the pointer must travel before a press on a mid-dot is a drag and not a click (L38).
// Four device pixels is a floor and not a taste: a hand resting on a trackpad always moves some
// pixel, and a threshold below that would take «lägg till en punkt» away from the shaky hand.
// Nothing about the gesture is decided until it is passed — released before, it was a click.
export const BEND_PX = 4

// Whether a press has become a drag. Device pixels and not millimetres: the threshold is about
// the hand on the desk, and the zoom must not make a steady hand shaky or a shaky one steady.
export function bendStarted(from: { x: number; y: number }, to: { x: number; y: number }, px: number = BEND_PX): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) >= px
}

// The side bent to where the pointer is (L38). A cubic whose two controls carry the same offset
// passes through its own middle at three quarters of that offset, so four thirds of how far the
// pointer has left the chord is what puts the middle of the side under the hand — «det man tar i
// är det som ändras». Only the two arms the side reads are written: the sides on either side of
// it are the straight lines they were.
export function bentEdge(points: readonly Point[], edge: number, to: Point, box: { w: number; h: number }): Point[] {
  const from = points[edge]
  const next = points[(edge + 1) % points.length]
  if (!from || !next) return [...points]
  const at = inside(to, box)
  const mid = { x: (from.x + next.x) / 2, y: (from.y + next.y) / 2 }
  const arm = { dx: (4 * (at.x - mid.x)) / 3, dy: (4 * (at.y - mid.y)) / 3 }
  return points.map((p, i) => {
    if (i === edge) return { ...p, out: held(p, arm, box) }
    if (i === (edge + 1) % points.length) return { ...p, in: held(p, arm, box) }
    return p
  })
}

// Where a handle stands on the card, or nothing at all for an arm the point does not carry: a
// handle appears once the curve exists (L38), and a point with no handle is a corner.
export function handleAt(points: readonly Point[], index: number, arm: Arm): Point | null {
  const p = points[index]
  const v = p?.[arm]
  return p && v ? { x: p.x + v.dx, y: p.y + v.dy } : null
}

// A handle pulled to where the pointer is. Mirroring is the default (L38): the opposite arm
// follows equally far the other way, so the curve runs evenly through the point rather than
// breaking at it — and `Alt` during the drag breaks it for that handle alone.
export function movedHandle(points: readonly Point[], index: number, arm: Arm, to: Point, box: { w: number; h: number }, mirror: boolean): Point[] {
  const at = points[index]
  if (!at) return [...points]
  const pulled = held(at, { dx: to.x - at.x, dy: to.y - at.y }, box)
  const other = arm === 'in' ? 'out' : 'in'
  return points.map((p, i) => (i === index ? { ...p, [arm]: pulled, ...(mirror ? { [other]: held(p, { dx: -pulled.dx, dy: -pulled.dy }, box) } : {}) } : p))
}

// «Räta ut punkten» (L38): the point gives its handles up and is a corner again.
export function straightPoint(points: readonly Point[], index: number): Point[] {
  return points.map((p, i) => (i === index ? { x: p.x, y: p.y } : p))
}

// «Räta ut alla»: the shape is the polygon L26 wrote, which is what a list with no handle left
// in it already is.
export function straightAll(points: readonly Point[]): Point[] {
  return points.map((p) => ({ x: p.x, y: p.y }))
}

// Whether the outline has a curve in it at all, which is what the two straightening commands
// are offered for.
export function bentPoints(points: readonly Point[]): boolean {
  return points.some((p) => p.in !== undefined || p.out !== undefined)
}

export type Arm = 'in' | 'out'

// An arm kept inside the box, in the tenth of a millimetre every other number on the canvas is
// written in. A cubic lies inside the hull its four controls span, and the renderer clips the
// outline to the element's box — so a control outside it is a curve cut off on the card, and the
// box wins over the arm exactly as it wins over the point (L26).
function held(at: Point, arm: { dx: number; dy: number }, box: { w: number; h: number }): { dx: number; dy: number } {
  const on = inside({ x: at.x + arm.dx, y: at.y + arm.dy }, box)
  return { dx: round(on.x - at.x), dy: round(on.y - at.y) }
}

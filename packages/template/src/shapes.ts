// The geometry of a shape (L17). Framework-free and free of the template model too: a rect in,
// a path out. The compiler, the editor's gallery and anything that ever needs to draw the same
// outline again all come through here, so a hexagon is the same hexagon everywhere.

export type Rect = { x: number; y: number; w: number; h: number }

// The closed vocabulary (L1). Three of them were always there; `polygon` and `star` are the
// parametric core, and the last three are outlines a corner count cannot describe.
export const SHAPES = ['rect', 'circle', 'line', 'polygon', 'star', 'shield', 'banner', 'arrow'] as const
export type ShapeName = (typeof SHAPES)[number]

// What a shape needs beyond its box. Every one is optional and every one has a default, so a
// shape written before a property existed still draws.
export type ShapeGeometry = {
  // `polygon`: how many sides. `star`: how many points.
  corners?: number | undefined
  // `star`: how deep the valleys cut, as a fraction of the tips' reach.
  innerRatio?: number | undefined
  // Clockwise, from the shape's own upright. Zero puts a corner at the top.
  rotationDeg?: number | undefined
  // `rect` only. Larger than the box is a capsule, not a mistake.
  radiusMm?: number | undefined
  // A shape of the designer's own (L26): the corners written out, which overrules every one of
  // the properties above and the shape's own name with them. The list is the outline.
  points?: readonly Point[] | undefined
  // The box the points were written in, when it is not the rect they are being drawn into. A
  // stroke straddles the path it lies on, so the compiler insets the rect by half the line —
  // and the outline has to come with it rather than stand still while its box shrinks.
  pointsBox?: { w: number; h: number } | undefined
}

const CORNERS = 6
const INNER = 0.45

// A path in the box's own units. Millimetres in, millimetres out — the caller decides what the
// coordinate system means.
export function pathFor(shape: ShapeName, rect: Rect, geom: ShapeGeometry = {}): string {
  // A point list is the outline and nothing else is consulted (L26). It comes first rather than
  // as a case of its own, because it can stand under any entry of the gallery: the entry a list
  // was written out of is kept so the designer can go back to it, not so it can argue.
  if (geom.points) return closed(placed(geom.points, rect, geom.pointsBox))
  switch (shape) {
    case 'rect':
      return rectPath(rect, geom.radiusMm ?? 0)
    case 'circle': {
      const { cx, cy, rx, ry } = middle(rect)
      // Two half-turns rather than one full one: an arc of exactly 360° has the same start and
      // end point and browsers draw nothing at all for it.
      return `M ${n(cx - rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)} Z`
    }
    case 'line': {
      const { cy } = middle(rect)
      // Open on purpose: a line is the one shape with no inside, and closing it would offer a
      // fill somewhere to paint that the designer never drew.
      return `M ${n(rect.x)} ${n(cy)} L ${n(rect.x + rect.w)} ${n(cy)}`
    }
    case 'polygon':
    case 'star':
    case 'banner':
    case 'arrow':
      return closed(pointsOf(shape, rect, geom) ?? [])
    case 'shield':
      return shieldPath(rect)
  }
}

// The corners a shape already consists of (L26), or `null` for one that consists of something
// else. It is the one-way door into a shape of the designer's own, and the door must change
// nothing on the way through: an outline drawn with an arc or a curve — a circle, a rounded
// rectangle, a shield — is not a point list, and a list that only looked like one would quietly
// redraw the card the moment the designer asked to shape it. A line is left out for a second
// reason: it has no inside, and a point list is a closed outline.
export function pointsOf(shape: ShapeName, rect: Rect, geom: ShapeGeometry = {}): Point[] | null {
  switch (shape) {
    case 'rect':
      return (geom.radiusMm ?? 0) > 0 ? null : boxCorners(rect)
    case 'polygon':
      return fitted(corners(geom.corners ?? CORNERS, geom.rotationDeg ?? 0), rect)
    case 'star':
      return fitted(corners(geom.corners ?? 5, geom.rotationDeg ?? 0, clamp(geom.innerRatio ?? INNER, 0.05, 0.95)), rect)
    case 'banner':
      return bannerCorners(rect)
    case 'arrow':
      return arrowCorners(rect)
    case 'circle':
    case 'line':
    case 'shield':
      return null
  }
}

// Which of the properties a shape actually reads, so the editor can show a corner count for a
// polygon and not for a circle without keeping its own copy of this knowledge.
export function shapeTakes(shape: ShapeName): { corners: boolean; innerRatio: boolean; rotation: boolean; radius: boolean } {
  return {
    corners: shape === 'polygon' || shape === 'star',
    innerRatio: shape === 'star',
    rotation: shape === 'polygon' || shape === 'star',
    radius: shape === 'rect',
  }
}

// A shape with no inside cannot be filled, and the compiler must not offer it one.
export function isOpen(shape: ShapeName): boolean {
  return shape === 'line'
}

// A point of an own outline (L26), with the handles that bend the sides it meets (L38, #327).
// The handles are offsets from the point rather than places on the card, so a point that is
// moved takes its curve with it and mirroring is one negation instead of a reflection.
export type Vec = { dx: number; dy: number }
export type Point = { x: number; y: number; in?: Vec | undefined; out?: Vec | undefined }

// A point list moved into the rect it is drawn in. The list is written in the element box's own
// millimetres with its top-left corner as the origin; `box` is that box when the rect is not it.
function placed(points: readonly Point[], rect: Rect, box: { w: number; h: number } | undefined): Point[] {
  const sx = box && box.w > 0 ? rect.w / box.w : 1
  const sy = box && box.h > 0 ? rect.h / box.h : 1
  // A handle stands still while its point moves would bend a different curve than the one that
  // was drawn, so the offsets are scaled by the same two factors as the points themselves.
  const arm = (v: Vec | undefined): Vec | undefined => (v === undefined ? undefined : { dx: v.dx * sx, dy: v.dy * sy })
  return points.map((p) => ({ x: rect.x + p.x * sx, y: rect.y + p.y * sy, in: arm(p.in), out: arm(p.out) }))
}

// The corners of a regular figure on the unit circle, the first one straight up. A star is the
// same walk with a shallower corner pushed in between each pair, which is why one function
// makes both: a star with its valleys all the way out is simply a polygon of twice the corners.
function corners(count: number, rotationDeg: number, innerRatio?: number): Point[] {
  const sides = Math.max(3, Math.min(48, Math.round(count)))
  const turn = (rotationDeg * Math.PI) / 180
  const out: Point[] = []
  for (let k = 0; k < sides; k++) {
    const a = -Math.PI / 2 + turn + (k * 2 * Math.PI) / sides
    out.push({ x: Math.cos(a), y: Math.sin(a) })
    if (innerRatio !== undefined) {
      const b = a + Math.PI / sides
      out.push({ x: innerRatio * Math.cos(b), y: innerRatio * Math.sin(b) })
    }
  }
  return out
}

// The figure stretched until it touches all four edges of the box. Not inscribed in a circle
// inside the box: the box is what the designer drags, what the corner handles hang on and what
// the guides snap to, so a shape that stops short of it points the whole editor at the card's
// paper instead of at itself — the same reason a picture fills its frame (L1). The price is
// that a hexagon in a wide box is a wide hexagon, which is what a layout tool does.
function fitted(points: Point[], rect: Rect): Point[] {
  const x0 = Math.min(...points.map((p) => p.x))
  const x1 = Math.max(...points.map((p) => p.x))
  const y0 = Math.min(...points.map((p) => p.y))
  const y1 = Math.max(...points.map((p) => p.y))
  const sx = x1 > x0 ? rect.w / (x1 - x0) : 0
  const sy = y1 > y0 ? rect.h / (y1 - y0) : 0
  return points.map((p) => ({ x: rect.x + (p.x - x0) * sx, y: rect.y + (p.y - y0) * sy }))
}

// The outline walked side by side (L38). A side whose two ends carry no handle is the straight
// line it always was — written as an `L` and not as a curve whose controls happen to lie on its
// ends — which is what makes a shape from before the handles existed draw byte for byte the same.
// The closing side is a side like any other: straight, it is left to the `Z`, and curved it is
// written out before it.
function closed(points: Point[]): string {
  const parts: string[] = []
  points.forEach((p, i) => {
    if (i === 0) parts.push(`M ${n(p.x)} ${n(p.y)}`)
    const to = points[(i + 1) % points.length]
    if (!to || (i === points.length - 1 && straight(p, to))) return
    parts.push(side(p, to))
  })
  return `${parts.join(' ')} Z`
}

function straight(from: Point, to: Point): boolean {
  return from.out === undefined && to.in === undefined
}

// One side of the outline: the out-handle of the point it leaves and the in-handle of the point
// it arrives at are the two controls, and a missing one lies on its own point.
function side(from: Point, to: Point): string {
  if (straight(from, to)) return `L ${n(to.x)} ${n(to.y)}`
  const c1 = { x: from.x + (from.out?.dx ?? 0), y: from.y + (from.out?.dy ?? 0) }
  const c2 = { x: to.x + (to.in?.dx ?? 0), y: to.y + (to.in?.dy ?? 0) }
  return `C ${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(to.x)} ${n(to.y)}`
}

// The four corners of the box, which is what a rectangle with no radius consists of.
function boxCorners(rect: Rect): Point[] {
  const { x, y, w, h } = rect
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}

function rectPath(rect: Rect, radiusMm: number): string {
  const { x, y, w, h } = rect
  if (radiusMm <= 0) return closed(boxCorners(rect))
  // Half the short side is as round as a rectangle gets; past that it is a capsule, which is
  // what the gallery's capsule asks for by naming a radius bigger than the box it is in.
  const r = Math.min(radiusMm, w / 2, h / 2)
  const arc = (tx: number, ty: number) => `A ${n(r)} ${n(r)} 0 0 1 ${n(tx)} ${n(ty)}`
  return [
    `M ${n(x + r)} ${n(y)}`,
    `L ${n(x + w - r)} ${n(y)}`,
    arc(x + w, y + r),
    `L ${n(x + w)} ${n(y + h - r)}`,
    arc(x + w - r, y + h),
    `L ${n(x + r)} ${n(y + h)}`,
    arc(x, y + h - r),
    `L ${n(x)} ${n(y + r)}`,
    arc(x + r, y),
    'Z',
  ].join(' ')
}

// A heater shield: square shoulders, straight down the flanks, then swept to a point.
function shieldPath(rect: Rect): string {
  const { x, y, w, h } = rect
  const cx = x + w / 2
  const shoulder = y + h * 0.55
  return [
    `M ${n(x)} ${n(y)}`,
    `L ${n(x + w)} ${n(y)}`,
    `L ${n(x + w)} ${n(shoulder)}`,
    `C ${n(x + w)} ${n(y + h * 0.86)} ${n(cx + w * 0.3)} ${n(y + h)} ${n(cx)} ${n(y + h)}`,
    `C ${n(cx - w * 0.3)} ${n(y + h)} ${n(x)} ${n(y + h * 0.86)} ${n(x)} ${n(shoulder)}`,
    'Z',
  ].join(' ')
}

// A ribbon: a plate with a swallowtail cut up into its bottom edge.
function bannerCorners(rect: Rect): Point[] {
  const { x, y, w, h } = rect
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x: x + w / 2, y: y + h * 0.68 },
    { x, y: y + h },
  ]
}

// An arrow to the right. A shaft half the box high and a head the last two fifths of it — the
// proportions a reader recognises as an arrow rather than as a triangle on a stick.
function arrowCorners(rect: Rect): Point[] {
  const { x, y, w, h } = rect
  const neck = x + w * 0.6
  return [
    { x, y: y + h * 0.25 },
    { x: neck, y: y + h * 0.25 },
    { x: neck, y },
    { x: x + w, y: y + h / 2 },
    { x: neck, y: y + h },
    { x: neck, y: y + h * 0.75 },
    { x, y: y + h * 0.75 },
  ]
}

function middle(rect: Rect): { cx: number; cy: number; rx: number; ry: number } {
  return { cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, rx: rect.w / 2, ry: rect.h / 2 }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}

// Coordinates are written to a tenth of a micrometre and no further. Trigonometry leaves
// 29.999999999999996 behind, and a path full of that is unreadable in a diff and no truer.
// Exported because a pattern's tile is measured in the same units by the same rule.
export function coord(v: number): string {
  return String(Math.round(v * 1e4) / 1e4)
}

const n = coord

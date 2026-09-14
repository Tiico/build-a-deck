// What the editor offers a shape (L17): a gallery of named outlines over a parametric core, the
// four shadows, and the five tiles. Framework-free like `canvas` and `groups`, so the panel that
// shows it stays a thin consumer — and so the choices can be checked without a DOM.
import { relativeLuminance, SHAPES, shapeTakes, type Element, type Paint, type Pattern, type Shadow } from '@byd/template'
import type { Key } from '../i18n/index.js'

export type Shape = Extract<Element, { kind: 'shape' }>
export type Geometry = Pick<Shape, 'shape' | 'corners' | 'innerRatio' | 'rotationDeg' | 'radiusMm'>

export { SHAPES, shapeTakes }

// The gallery is the door and the parameters are the room behind it (L14's shape, applied to a
// vocabulary): every entry here is a corner count and a turn the designer could have dialled in
// by hand, except the three outlines a corner count cannot describe.
//
// `radiusMm` is written by every rectangle entry rather than left alone, because a rectangle
// chosen from the gallery must come back square — a leftover radius would make the entry a lie.
// The capsule's radius is `null`, which this module reads as half the short side of the box the
// shape is actually in: a capsule is not a shape of its own, and the document should say a
// number in the card's own millimetres rather than a magic word.
export type GalleryEntry = { id: string; name: Key; geometry: Omit<Geometry, 'radiusMm'> & { radiusMm?: number | null } }

export const SHAPE_GALLERY: readonly GalleryEntry[] = [
  { id: 'rect', name: 'canvas.shape.rect', geometry: { shape: 'rect', radiusMm: 0 } },
  { id: 'rounded', name: 'canvas.shape.rounded', geometry: { shape: 'rect', radiusMm: 3 } },
  { id: 'capsule', name: 'canvas.shape.capsule', geometry: { shape: 'rect', radiusMm: null } },
  { id: 'circle', name: 'canvas.shape.circle', geometry: { shape: 'circle' } },
  { id: 'line', name: 'canvas.shape.line', geometry: { shape: 'line' } },
  { id: 'triangle', name: 'canvas.shape.triangle', geometry: { shape: 'polygon', corners: 3, rotationDeg: 0 } },
  { id: 'diamond', name: 'canvas.shape.diamond', geometry: { shape: 'polygon', corners: 4, rotationDeg: 0 } },
  { id: 'square', name: 'canvas.shape.square', geometry: { shape: 'polygon', corners: 4, rotationDeg: 45 } },
  { id: 'pentagon', name: 'canvas.shape.pentagon', geometry: { shape: 'polygon', corners: 5, rotationDeg: 0 } },
  { id: 'hexagon', name: 'canvas.shape.hexagon', geometry: { shape: 'polygon', corners: 6, rotationDeg: 0 } },
  { id: 'hexagonFlat', name: 'canvas.shape.hexagonFlat', geometry: { shape: 'polygon', corners: 6, rotationDeg: 30 } },
  { id: 'octagon', name: 'canvas.shape.octagon', geometry: { shape: 'polygon', corners: 8, rotationDeg: 22.5 } },
  { id: 'star', name: 'canvas.shape.star', geometry: { shape: 'star', corners: 5, innerRatio: 0.45, rotationDeg: 0 } },
  { id: 'star6', name: 'canvas.shape.star6', geometry: { shape: 'star', corners: 6, innerRatio: 0.55, rotationDeg: 0 } },
  { id: 'shield', name: 'canvas.shape.shield', geometry: { shape: 'shield' } },
  { id: 'banner', name: 'canvas.shape.banner', geometry: { shape: 'banner' } },
  { id: 'arrow', name: 'canvas.shape.arrow', geometry: { shape: 'arrow' } },
]

// A sensible line for a shape that has never had one. Without it, choosing `Linje` from the
// gallery leaves a shape with a fill it can no longer show and no line to show instead — the
// designer picks a shape and the card goes blank.
const LINE_MM = 0.5
const LINE_INK = '#111111'

// What one press of a gallery entry writes. The whole outline at once: a shape is the entry it
// was chosen from, not the entry plus whatever the last one left behind.
export function shapeChoice(entry: GalleryEntry, el: Shape): Partial<Shape> {
  const { radiusMm, ...rest } = entry.geometry
  const patch: Partial<Shape> = { ...rest }
  if (radiusMm !== undefined) patch.radiusMm = radiusMm === null ? Math.min(el.w, el.h) / 2 : radiusMm
  if (entry.geometry.shape === 'line' && !el.stroke) {
    patch.stroke = typeof el.fill === 'string' ? el.fill : LINE_INK
    if ((el.strokeMm ?? 0) <= 0) patch.strokeMm = LINE_MM
  }
  return patch
}

// What a gallery entry looks like on its own button. The capsule's radius is `null` in the entry
// — half the short side of whatever box it lands in — so it is resolved against the glyph's own
// box here, the same way `shapeChoice` resolves it against the element's.
export function glyphGeometry(entry: GalleryEntry, box: { w: number; h: number }): Geometry {
  const { radiusMm, ...rest } = entry.geometry
  if (radiusMm === undefined) return rest
  return { ...rest, radiusMm: radiusMm === null ? Math.min(box.w, box.h) / 2 : radiusMm }
}

// Which entry a shape already is, so the gallery can say so. A rectangle is told apart by its
// radius: none is the plain one, half the short side or more is the capsule, anything between
// is the rounded one.
export function galleryIdOf(el: Shape): string | null {
  if (el.shape === 'rect') {
    const r = el.radiusMm ?? 0
    if (r <= 0) return 'rect'
    return r >= Math.min(el.w, el.h) / 2 ? 'capsule' : 'rounded'
  }
  const takes = shapeTakes(el.shape)
  return (
    SHAPE_GALLERY.find(
      (e) =>
        e.geometry.shape === el.shape &&
        (!takes.corners || e.geometry.corners === el.corners) &&
        (!takes.rotation || (e.geometry.rotationDeg ?? 0) === (el.rotationDeg ?? 0)),
    )?.id ?? null
  )
}

// The four shadows (L17). `undefined` is one of them and not the absence of a choice: "no
// shadow" is a thing the designer picked, and the panel has to be able to say it is picked.
export type ShadowPreset = { id: string; name: Key; shadow: Shadow | undefined }
export const SHADOWS: readonly ShadowPreset[] = [
  { id: 'none', name: 'canvas.shadow.none', shadow: undefined },
  { id: 'soft', name: 'canvas.shadow.soft', shadow: { dxMm: 0, dyMm: 0.6, blurMm: 1.2, color: '#000000', opacity: 0.35 } },
  { id: 'hard', name: 'canvas.shadow.hard', shadow: { dxMm: 0.5, dyMm: 0.5, blurMm: 0, color: '#000000', opacity: 0.5 } },
  { id: 'lift', name: 'canvas.shadow.lift', shadow: { dxMm: 0, dyMm: 1.6, blurMm: 2.6, color: '#000000', opacity: 0.45 } },
]

// Which preset a shadow is, or none of them once it has been adjusted by hand.
export function shadowIdOf(shadow: Shadow | undefined): string | null {
  return SHADOWS.find((p) => JSON.stringify(p.shadow ?? null) === JSON.stringify(shadow ?? null))?.id ?? null
}

export const PATTERNS: readonly { kind: Pattern['kind']; name: Key }[] = [
  { kind: 'stripes', name: 'canvas.pattern.stripes' },
  { kind: 'grid', name: 'canvas.pattern.grid' },
  { kind: 'dots', name: 'canvas.pattern.dots' },
  { kind: 'diamonds', name: 'canvas.pattern.diamonds' },
  { kind: 'chevron', name: 'canvas.pattern.chevron' },
]

// The tile a pattern starts as: big enough to read on a card held at arm's length, and in
// whichever of black and white stands out against the fill it is being laid over. A pattern
// nobody can see is a switch that looks broken, and white on the pale colour a new shape starts
// in was exactly that.
//
// A fill that follows a column (L16) has no one colour to judge, and a shape with no fill shows
// the card's paper, which is light far more often than not — both start dark.
const PALE = 0.35
export function newPattern(fill: Paint | undefined): Pattern {
  const under = typeof fill === 'string' ? fill : undefined
  return { kind: 'diamonds', color: under && relativeLuminance(under) < PALE ? '#ffffff' : '#000000', scaleMm: 6 }
}

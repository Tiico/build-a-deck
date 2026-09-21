import { z } from 'zod'
import { SHAPES } from './shapes.js'

// Optional fields have defaults applied by the compiler, so a template can be authored sparsely.
// The template element model (L1): a small, closed set of typed elements with positions in
// millimetres and styles from a fixed palette. Data, not code — versioned, diffed, migrated.

// A card's data as the compiler sees it: one row of the deck.
export type Row = Record<string, string | number | boolean | null | undefined>

const Mm = z.number()
const Bind = z.union([z.object({ field: z.string().min(1) }), z.object({ literal: z.string() })])
export type Bind = z.infer<typeof Bind>

// What every element carries for the person editing it rather than for the card (L15): the word
// the designer calls the layer, and whether the layer is locked. The compiler never reads either
// — a card is the same card whether or not a layer was locked while it was drawn — but they are
// template data like everything else, so they are versioned, diffed and shared with whoever else
// has the project open, exactly as a position is.
const Designer = { name: z.string().min(1).optional(), locked: z.literal(true).optional() }

const Box = { id: z.string().min(1), x: Mm, y: Mm, w: Mm.nonnegative(), h: Mm.nonnegative(), ...Designer }

export const Font = z.object({
  family: z.string().min(1),
  sizePt: z.number().positive(),
  weight: z.union([z.literal(400), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().positive().optional(),
  // Spärrat eller knip (#219), in ems of this element's own font rather than in millimetres: the
  // fitting steps the size down in the browser (E6), and a gap in millimetres would stay behind
  // at the size the template was drawn at. Negative tightens.
  letterSpacing: z.number().optional(),
})
export type Font = z.infer<typeof Font>

export const TextElement = z.object({
  kind: z.literal('text'),
  ...Box,
  bind: Bind,
  font: Font,
  color: z.string().min(1),
  // 'shrink' steps the size down to the type's minimum for the script before warning (E6).
  fit: z.enum(['fixed', 'shrink']).optional(),
  // Where the text stands in its box from top to bottom (#219). Sideways is `font.align`, which
  // is a property of the setting; this is a property of the box, like `fit`, and sits here for
  // the same reason. A text that says nothing stands at the top, which is where every text has
  // stood since there were text elements — so an old template compiles to the bytes it always
  // compiled to.
  valign: z.enum(['top', 'middle', 'bottom']).optional(),
})
export const ImageElement = z.object({
  kind: z.literal('image'),
  ...Box,
  bind: Bind,
  // How the picture meets its frame. 'cover' fills the frame and crops what will not fit, 'fill'
  // stretches the picture to the frame, and both make the frame exactly what is seen — which is
  // what the corner handles, the selection outline and the snap guides all stand on. 'contain'
  // fits the whole picture inside the frame instead, and is the one that can leave the card's
  // paper showing between the picture and its own edges.
  fit: z.enum(['cover', 'contain', 'fill']).optional(),
  // Fit what is drawn rather than the file it arrived in (E1). A deck's art is one file per
  // card, and two files holding the same motif rarely hold it at the same size — one carries a
  // wide transparent border, the next almost none — so fitting files draws the motif a different
  // size on every card. With this on, the uniform border a file carries is measured once per
  // asset and left out of the fitting, and the picture is then cropped by the frame as ever.
  // A file nothing has measured is fitted as a file, so a picture is never lost to this.
  trim: z.literal(true).optional(),
  // The deck's measure (E1): how large the drawing is drawn. `trim` takes the air off a file, but
  // it cannot say how big the drawing should be — so two files that carry different amounts of
  // air still draw their motifs at different sizes as soon as their proportions differ. The
  // measure is what makes them agree, and it lives here rather than on the project because the
  // frame's shape comes from this element: a template with both a large illustration and a small
  // portrait has to be able to frame them differently.
  // Like `trim`, it needs a measurement; an unmeasured file is fitted as a file.
  //
  // It once also said where in its window the drawing stood, and no longer does (#221, L22,
  // beslut 3): that was the template answering a question about the picture, and a picture
  // carrying its own crop has answered it. Refused rather than ignored, so a stored template can
  // only reach this schema through `liftTemplate` and nothing drops the field quietly.
  frame: z.strictObject({ fill: z.number().gt(0).lte(1) }).optional(),
})
export const IconsElement = z.object({
  kind: z.literal('icons'),
  ...Box,
  bind: Bind,
  iconMm: Mm.positive(),
  gapMm: Mm.nonnegative().optional(),
})
// A colour, or a rule that reads one off the deck (L16): the column to look in, a colour per
// value, and what a value the rule does not name gets. The colours stay in the template, where
// every other style lives — the deck says which of them a card gets, and changing a shade is one
// edit rather than one per card.
export const Paint = z.union([
  z.string().min(1),
  z.object({
    field: z.string().min(1),
    map: z.record(z.string(), z.string().min(1)),
    // Unnamed on purpose in the document: `else` is what a card gets when its value is not in the
    // map, including when the cell is empty. Without one such a card is simply unpainted, which
    // is what a shape with no fill at all has always been.
    else: z.string().min(1).optional(),
  }),
])
export type Paint = z.infer<typeof Paint>

// The colour a row gets out of a paint. The one place a paint is turned into a colour, so the
// compiler, the physical checks and the editor's preview can never disagree about it.
export function paintOf(paint: Paint | undefined, row: Row): string | undefined {
  if (paint === undefined || typeof paint === 'string') return paint
  const value = row[paint.field]
  const named = value === null || value === undefined ? undefined : paint.map[String(value)]
  return named ?? paint.else
}

// A shadow (L17): how far the shape is lifted off the paper, how softly, and in what colour.
// Transparency is its own number rather than part of the colour, because the tool that picks a
// colour cannot say how see-through it is — and a shadow that is not see-through is a cut-out.
export const Shadow = z.object({
  dxMm: Mm,
  dyMm: Mm,
  blurMm: Mm.nonnegative(),
  color: z.string().min(1),
  opacity: z.number().min(0).max(1).optional(),
})
export type Shadow = z.infer<typeof Shadow>

// A pattern (L17): ink repeated over the fill. It is a layer and not a fill of its own, so a
// fill that follows a column (L16) keeps following it and the pattern rides on whatever colour
// the row lands on. `weight` is how much of each tile the ink takes, from a hairline to nearly
// solid; what that means is the pattern's own business, which is why one number covers all five.
export const Pattern = z.object({
  kind: z.enum(['stripes', 'grid', 'dots', 'diamonds', 'chevron']),
  color: z.string().min(1),
  scaleMm: Mm.positive(),
  angleDeg: z.number().optional(),
  weight: z.number().positive().max(1).optional(),
})
export type Pattern = z.infer<typeof Pattern>

// One arm of a point's curve (L38): where the control lies, in millimetres from the point.
const Handle = z.object({ dx: Mm, dy: Mm })

export const ShapeElement = z.object({
  kind: z.literal('shape'),
  ...Box,
  shape: z.enum(SHAPES),
  fill: Paint.optional(),
  stroke: z.string().optional(),
  strokeMm: Mm.nonnegative().optional(),
  radiusMm: Mm.nonnegative().optional(),
  // The parametric core (L17). `corners` is a polygon's sides and a star's points; `innerRatio`
  // is how deep a star's valleys cut; `rotationDeg` turns either of them. A shape that does not
  // read a property ignores it rather than rejecting it, so switching a hexagon to a circle and
  // back does not lose the six.
  corners: z.number().int().min(3).max(48).optional(),
  innerRatio: z.number().min(0.05).max(0.95).optional(),
  rotationDeg: z.number().optional(),
  // A shape of the designer's own (L26): the corners written out, in the element box's own
  // millimetres with its top-left corner as the origin. It is the one property that overrules
  // `shape` — a point list is an outline no corner count can describe, and the gallery entry the
  // list was written out of stays where it is so the designer can go back to it.
  //
  // Optional, because every template written before the field existed has none and must draw
  // byte for byte the same. Three is the floor: two points are a line and not a shape.
  // A point may carry an in- and an out-handle (L38, #327), in millimetres from the point
  // itself: the two controls of the cubic the sides meeting there are drawn with. A point with
  // neither is a corner, and a side with no handle at either end is a straight line — which is
  // what keeps a shape written before the handles existed drawing byte for byte the same.
  points: z.array(z.object({ x: Mm, y: Mm, in: Handle.optional(), out: Handle.optional() })).min(3).optional(),
  pattern: Pattern.optional(),
  shadow: Shadow.optional(),
  // How see-through the whole shape is (#317): one number for the layer, so the fill, the
  // pattern riding over it and the line fade together. Not one transparency per layer, because
  // what the designer is after is a pane laid over a picture, and a pane whose edge is more solid
  // than its middle is a second thing to keep in step for no gain.
  // It is optional and means `1` when absent: a template written before the field existed has no
  // opinion about transparency, and the compiler writes nothing at all for such a shape — so
  // every card that renders today renders byte for byte the same tomorrow.
  opacity: z.number().min(0).max(1).optional(),
})

// The one way from a shadow to the colour it is drawn in, for the same reason `paintOf` is the
// one way from a fill to one: the compiler and the editor's preview can never disagree about it.
export function shadowCss(shadow: Shadow): string {
  const colour = shadow.opacity === undefined ? shadow.color : rgba(shadow.color, shadow.opacity)
  return `drop-shadow(${shadow.dxMm}mm ${shadow.dyMm}mm ${shadow.blurMm}mm ${colour})`
}

// A colour the reader named, made see-through. A colour this cannot read is carried through as
// it is: a shadow in a colour the tool never offered is still better than no shadow at all.
function rgba(colour: string, opacity: number): string {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour.trim())?.[1]
  if (digits === undefined) return colour
  const h = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits
  const n = Number.parseInt(h, 16)
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${opacity})`
}

// Conditions (L3): show the children only when a field is non-empty or equals a value.
export const Condition = z.union([
  z.object({ field: z.string().min(1), nonEmpty: z.literal(true) }),
  z.object({ field: z.string().min(1), equals: z.string() }),
])
export type Condition = z.infer<typeof Condition>

export type Element =
  | z.infer<typeof TextElement>
  | z.infer<typeof ImageElement>
  | z.infer<typeof IconsElement>
  | z.infer<typeof ShapeElement>
  | { kind: 'group'; id: string; x: number; y: number; children: Element[]; name?: string; locked?: true }
  | { kind: 'if'; id: string; when: Condition; children: Element[]; name?: string; locked?: true }

export const Element: z.ZodType<Element> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    TextElement,
    ImageElement,
    IconsElement,
    ShapeElement,
    z.object({ kind: z.literal('group'), id: z.string().min(1), x: Mm, y: Mm, children: z.array(Element), ...Designer }),
    z.object({ kind: z.literal('if'), id: z.string().min(1), when: Condition, children: z.array(Element), ...Designer }),
  ]),
) as z.ZodType<Element>

// A variant (L3) overrides base elements by id, and may add or remove some.
export const Variant = z.object({
  override: z.array(Element).optional(),
  remove: z.array(z.string()).optional(),
})
export type Variant = z.infer<typeof Variant>

export const FaceTemplate = z.object({
  base: z.array(Element),
  variants: z.record(z.string(), Variant),
  // The row column whose value names the variant.
  variantBy: z.string().min(1).optional(),
})
export type FaceTemplate = z.infer<typeof FaceTemplate>

// One template per face (L7). The back is usually a constant.
export const Template = z.object({ faces: z.record(z.string(), FaceTemplate) })
export type Template = z.infer<typeof Template>



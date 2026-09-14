import { z } from 'zod'

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

export const ShapeElement = z.object({
  kind: z.literal('shape'),
  ...Box,
  shape: z.enum(['rect', 'circle', 'line']),
  fill: Paint.optional(),
  stroke: z.string().optional(),
  strokeMm: Mm.nonnegative().optional(),
  radiusMm: Mm.nonnegative().optional(),
})

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



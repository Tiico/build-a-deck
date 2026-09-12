import { z } from 'zod'

// Optional fields have defaults applied by the compiler, so a template can be authored sparsely.
// The template element model (L1): a small, closed set of typed elements with positions in
// millimetres and styles from a fixed palette. Data, not code — versioned, diffed, migrated.

const Mm = z.number()
const Bind = z.union([z.object({ field: z.string().min(1) }), z.object({ literal: z.string() })])
export type Bind = z.infer<typeof Bind>

const Box = { id: z.string().min(1), x: Mm, y: Mm, w: Mm.nonnegative(), h: Mm.nonnegative() }

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
})
export const IconsElement = z.object({
  kind: z.literal('icons'),
  ...Box,
  bind: Bind,
  iconMm: Mm.positive(),
  gapMm: Mm.nonnegative().optional(),
})
export const ShapeElement = z.object({
  kind: z.literal('shape'),
  ...Box,
  shape: z.enum(['rect', 'circle', 'line']),
  fill: z.string().optional(),
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
  | { kind: 'group'; id: string; x: number; y: number; children: Element[] }
  | { kind: 'if'; id: string; when: Condition; children: Element[] }

export const Element: z.ZodType<Element> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    TextElement,
    ImageElement,
    IconsElement,
    ShapeElement,
    z.object({ kind: z.literal('group'), id: z.string().min(1), x: Mm, y: Mm, children: z.array(Element) }),
    z.object({ kind: z.literal('if'), id: z.string().min(1), when: Condition, children: z.array(Element) }),
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

export type Row = Record<string, string | number | boolean | null | undefined>

import { z } from 'zod'
import { FaceId, type TypeRef } from '@byd/protocol'

// A component type is data: immutable, versioned, pinned by a game version.
// The engine knows nothing about cards or dice — only what a definition declares.

export const FieldDef = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  kind: z.enum(['text', 'number', 'image', 'boolean']),
  required: z.boolean().default(false),
})
export type FieldDef = z.infer<typeof FieldDef>

export const ComponentTypeDef = z.object({
  id: z.string().min(1),
  version: z.number().int().nonnegative(),
  physical: z.object({
    shape: z.enum(['rect', 'roundedRect', 'hex', 'circle']),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    thicknessMm: z.number().positive(),
    cornerRadiusMm: z.number().nonnegative().optional(),
    material: z.string().min(1),
  }),
  faces: z.array(FaceId).min(1),
  // The face that carries the component's identity. Showing any other face hides it.
  contentFace: FaceId,
  behaviours: z.object({
    stackable: z.boolean(),
    shufflable: z.boolean(),
    flippable: z.boolean(),
    rollable: z.union([z.literal(false), z.object({ faces: z.number().int().min(2) })]),
    counter: z.boolean(),
  }),
  editorSchema: z.array(FieldDef),
  print: z.object({
    bleedMm: z.number().nonnegative(),
    safeMm: z.number().nonnegative(),
    dpi: z.number().int().positive(),
    colorProfile: z.string().min(1),
    minPtByScript: z.record(z.string(), z.number().positive()),
  }),
  manufacturableBy: z.array(z.string().min(1)),
})
export type ComponentTypeDef = z.infer<typeof ComponentTypeDef>

export const typeKey = (ref: TypeRef): string => `${ref.id}@${ref.version}`

export class TypeRegistry {
  private readonly defs = new Map<string, ComponentTypeDef>()

  constructor(defs: readonly ComponentTypeDef[] = []) {
    for (const d of defs) this.register(d)
  }

  register(def: ComponentTypeDef): void {
    const key = typeKey(def)
    if (this.defs.has(key)) throw new Error(`type ${key} is already registered and immutable`)
    this.defs.set(key, ComponentTypeDef.parse(def))
  }

  get(ref: TypeRef): ComponentTypeDef {
    const def = this.defs.get(typeKey(ref))
    if (!def) throw new Error(`unknown component type ${typeKey(ref)}`)
    return def
  }

  has(ref: TypeRef): boolean {
    return this.defs.has(typeKey(ref))
  }
}

// The one type the thin slice needs.
export const CARD_STANDARD_63x88: ComponentTypeDef = {
  id: 'card.standard.63x88',
  version: 1,
  physical: {
    shape: 'roundedRect',
    widthMm: 63,
    heightMm: 88,
    thicknessMm: 0.3,
    cornerRadiusMm: 3,
    material: 'cardstock-300gsm',
  },
  faces: ['front', 'back'],
  contentFace: 'front',
  behaviours: { stackable: true, shufflable: true, flippable: true, rollable: false, counter: false },
  editorSchema: [
    { key: 'title', label: 'Title', kind: 'text', required: true },
    { key: 'cost', label: 'Cost', kind: 'number', required: false },
    { key: 'body', label: 'Body', kind: 'text', required: false },
    { key: 'art', label: 'Art', kind: 'image', required: false },
  ],
  print: {
    bleedMm: 3,
    safeMm: 3,
    dpi: 300,
    colorProfile: 'sRGB',
    minPtByScript: { Latn: 6, Hani: 8, Arab: 7 },
  },
  manufacturableBy: [],
}

import { z } from 'zod'
import { FaceId, TypeRef } from '@byd/protocol'

// What crosses the line between the platform and a print partner (F2, TUNN-SKIVA §4), as data
// with its validation. The partner's requirements, the manifest the platform hands over, the
// prepared order that comes back, and the quote and status a partner answers with.

export const ProviderId = z.string().min(1)
export type ProviderId = z.infer<typeof ProviderId>

// An ISO 3166-1 alpha-2 country code, as a partner's address forms and plants name them.
export const Country = z.string().regex(/^[A-Z]{2}$/)
export type Country = z.infer<typeof Country>

// Money in minor units, so a price never meets a binary fraction.
export const Money = z.object({ amountMinor: z.number().int().nonnegative(), currency: z.enum(['EUR', 'SEK', 'USD']) })
export type Money = z.infer<typeof Money>

export const Destination = z.object({ country: Country })
export type Destination = z.infer<typeof Destination>

// What one copy of the game costs to have made and sent (TUNN-SKIVA §4, F3). `duties: 'unknown'`
// is a deliberate part of the type: customs into the EU from a partner in the US or Asia is an
// open question (I), and the contract does not pretend it is settled. `basis` says whose price
// it is: a real partner's answer, or one the fake made up, which must never be shown as a price.
export const Quote = z.object({
  basis: z.enum(['partner', 'fictional']),
  unitPrice: Money,
  shipping: Money,
  duties: z.union([Money, z.literal('unknown')]),
  leadTimeDays: z.number().int().nonnegative(),
})
export type Quote = z.infer<typeof Quote>

const Mm = z.number().positive()

// The tokens a file name may be built from. `{n}` is the file's number in the prepared order,
// from 1; `{cardRef}` the card's id, folded to what a file system takes; `{face}` our name for
// the side, and `{side}` the partner's. The extension follows from the format and is not written.
export const FILE_NAME_TOKENS = ['{n}', '{cardRef}', '{face}', '{side}'] as const
const FileName = z
  .string()
  .min(1)
  .refine((s) => /^[A-Za-z0-9_{}-]+$/.test(s), 'a file name is letters, digits, «_», «-» and tokens')
  .refine((s) => (s.match(/\{[^}]*\}/g) ?? []).every((t) => (FILE_NAME_TOKENS as readonly string[]).includes(t)), `the only tokens are ${FILE_NAME_TOKENS.join(' ')}`)

// A raster is drawn at exactly `widthPx` × `heightPx`, which is the trim plus the bleed on every
// edge at `dpi`. A vector file is a PDF whose page is that same box in millimetres.
export const RasterFile = z.object({ kind: z.literal('raster'), format: z.enum(['png', 'jpg']), dpi: z.number().int().positive(), widthPx: z.number().int().positive(), heightPx: z.number().int().positive() })
export const VectorFile = z.object({ kind: z.literal('vector'), format: z.literal('pdf') })
export const FileFormat = z.discriminatedUnion('kind', [RasterFile, VectorFile])
export type FileFormat = z.infer<typeof FileFormat>

// What the partner wants for one component type it prints: the one source of truth for trim,
// bleed, pixels and format downstream (#1207). Nothing after this assumes a fixed 3 mm.
export const PrintedRequirements = z.object({
  kind: z.literal('printed'),
  type: TypeRef,
  // The partner's own product the type is made as.
  sku: z.string().min(1),
  trim: z.object({ widthMm: Mm, heightMm: Mm }),
  bleedMm: z.number().nonnegative(),
  safeMm: z.number().nonnegative(),
  file: FileFormat,
  colorSpace: z.enum(['sRGB', 'CMYK']),
  // The stem of each file's name, from FILE_NAME_TOKENS.
  fileName: FileName,
  // Our name for each side the partner prints, to the partner's word for it.
  sides: z.record(FaceId, z.string().min(1)).refine((s) => Object.keys(s).length > 0, 'a printed type prints at least one side'),
})
export type PrintedRequirements = z.infer<typeof PrintedRequirements>

// A stock item the partner buys and packs (#1140): a die, as the partner's part number.
export const StockRequirements = z.object({ kind: z.literal('stock'), type: TypeRef, sku: z.string().min(1) })
export type StockRequirements = z.infer<typeof StockRequirements>

export const PrintRequirements = z.discriminatedUnion('kind', [PrintedRequirements, StockRequirements])
export type PrintRequirements = z.infer<typeof PrintRequirements>

// What the platform hands a partner: the game as physical things, before anything is drawn.
//
// One entry per physical card, so two copies are two entries, as the setup lists them and as
// `printExportOf` does. `faces` names each side by what it shows: an opaque content key the
// caller chooses (a hash of the compiled face, say), where the same key means the same picture.
// A front and its back stand in one entry and are never paired anywhere else (L3, L7).
export const ManifestCard = z.object({ cardRef: z.string().min(1), type: TypeRef, faces: z.record(FaceId, z.string().min(1)) })
export type ManifestCard = z.infer<typeof ManifestCard>
export const ManifestHardware = z.object({ type: TypeRef, count: z.number().int().positive() })
export type ManifestHardware = z.infer<typeof ManifestHardware>
export const PrintManifest = z.object({ cards: z.array(ManifestCard), hardware: z.array(ManifestHardware) })
export type PrintManifest = z.infer<typeof PrintManifest>

// One file the partner gets: what to draw and exactly how. Rendering it is the one renderer's
// job (E2, #1207): compile `cardRef`'s `face` with `bleedMm` of bleed, and draw it as `file` says.
// Two cards whose side shows the same `content` share the file.
export const PreparedFile = z.object({
  name: z.string().min(1),
  type: TypeRef,
  // The first card that names this picture, which is the one to compile it from.
  cardRef: z.string().min(1),
  face: FaceId,
  // The partner's word for the side.
  side: z.string().min(1),
  content: z.string().min(1),
  trim: z.object({ widthMm: Mm, heightMm: Mm }),
  bleedMm: z.number().nonnegative(),
  safeMm: z.number().nonnegative(),
  file: FileFormat,
  colorSpace: z.enum(['sRGB', 'CMYK']),
})
export type PreparedFile = z.infer<typeof PreparedFile>

// A card of the manifest as the partner will make it: each side as the file that draws it.
export const PreparedCard = z.object({ cardRef: z.string().min(1), type: TypeRef, sku: z.string().min(1), files: z.record(FaceId, z.string().min(1)) })
export type PreparedCard = z.infer<typeof PreparedCard>

export const PreparedHardware = z.object({ type: TypeRef, sku: z.string().min(1), count: z.number().int().positive() })
// A stock item the partner does not pack is left out of the order and said to be, never dropped
// in silence: the designer is told the game arrives without it.
export const OmittedHardware = z.object({ type: TypeRef, count: z.number().int().positive(), reason: z.literal('not-packed') })

// One call the partner would get, in its own words, with its own body. A file stands in a
// payload as `{ "file": name }`, a name from `files`: `submit` puts the upload or the URL there.
export const OrderStep = z.object({ action: z.string().min(1), payload: z.json() })
export type OrderStep = z.infer<typeof OrderStep>

// What would be sent, prepared without a word to the partner: the same thing whether it is
// ordered or shown to the designer as the print package (F1, #1208).
export const PreparedOrder = z.object({
  provider: ProviderId,
  files: z.array(PreparedFile),
  cards: z.array(PreparedCard),
  hardware: z.array(PreparedHardware),
  omitted: z.array(OmittedHardware),
  steps: z.array(OrderStep).min(1),
})
export type PreparedOrder = z.infer<typeof PreparedOrder>

// The partner's name for an order it accepted.
export const ProviderOrderRef = z.object({ provider: ProviderId, id: z.string().min(1) })
export type ProviderOrderRef = z.infer<typeof ProviderOrderRef>

// How far the order has come. `unknown` is a partner that does not tell (QPMN in #1199 names no
// tracking), said as such rather than as a state nobody reported.
export const OrderStatus = z.object({
  state: z.enum(['received', 'in-production', 'shipped', 'delivered', 'cancelled', 'unknown']),
  tracking: z.object({ carrier: z.string().min(1), number: z.string().min(1) }).optional(),
})
export type OrderStatus = z.infer<typeof OrderStatus>

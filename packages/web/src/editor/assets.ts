import { ASSET_MAX_BYTES, sniffAsset } from '@byd/protocol'
import type { ProjectDoc, Row } from './types.js'

// The project's images in the editor (E1, DRIFT §4): a row points at an image by the hash of
// its bytes, `asset:<hash>`, and the server serves it at /assets/<hash>. The card compiler
// wants a URL, so a row is resolved before it is compiled; the same hash on ten cards is one
// image, uploaded once.
export const ASSET_PREFIX = 'asset:'
export const ASSET_DRAG_TYPE = 'text/x-byd-asset'

export const isAssetRef = (value: unknown): value is string => typeof value === 'string' && value.startsWith(ASSET_PREFIX) && /^[0-9a-f]{64}$/.test(value.slice(ASSET_PREFIX.length))
export const assetRef = (hash: string): string => `${ASSET_PREFIX}${hash}`
export const assetUrl = (base: string, hash: string): string => `${base}/assets/${hash}`

export function resolveAssetRow(row: Row, base: string): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[k] = isAssetRef(v) ? assetUrl(base, v.slice(ASSET_PREFIX.length)) : v
  return out
}

// The project's icon set as a preview can load it (E1). A symbol taken into a game becomes one of
// the project's own assets, so the set holds `asset:<hash>` — which is a reference the store
// understands and a browser does not. The renderer is handed resolved icons on the server side
// too; this is the same resolution on the editor's side, so the card the designer looks at draws
// the symbols rather than three broken images.
export function previewIcons(doc: Pick<ProjectDoc, 'icons'>, assetBase: string | undefined): Record<string, string> {
  if (!assetBase) return doc.icons
  const out: Record<string, string> = {}
  for (const [name, url] of Object.entries(doc.icons)) out[name] = isAssetRef(url) ? assetUrl(assetBase, url.slice(ASSET_PREFIX.length)) : url
  return out
}

// The fields the template draws as images, in template order.
// The columns a row of icons reads (L1). Such a cell is a list of names split on spaces and
// commas, not card text — so an icon written there wears no braces, and one written with them
// would simply never be found (#33).
export function iconFieldsOf(doc: ProjectDoc): string[] {
  const out: string[] = []
  const walk = (els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'icons' && 'field' in el.bind && !out.includes(el.bind.field)) out.push(el.bind.field)
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

export function imageFieldsOf(doc: ProjectDoc): string[] {
  const out: string[] = []
  const walk = (els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'image' && 'field' in el.bind && !out.includes(el.bind.field)) out.push(el.bind.field)
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  return out
}

// Every picture the game holds, once, with the cards it sits on, in the order first seen (#222,
// L22). The deck's rows first, then the pictures the template draws by itself, then the
// rulebook's — because the media library is a library and not a list of what happens to be in
// use: a picture no card uses is what there is to tidy, and it is marked and never purged, since
// the bytes are content-addressed and an older version of the deck may still point at them.
//
// The symbol set is deliberately not here. A symbol is a drawing the tool fetched from a library,
// named in the game's own words and counted in its own tab (E4); this is the deck's art.
export function mediaInGame(doc: ProjectDoc): { hash: string; cards: string[] }[] {
  const seen = new Map<string, string[]>()
  // A picture is met either on a card or on its own. Meeting it at all puts it in the library;
  // only a card adds to what uses it.
  const met = (value: unknown, cardRef?: string) => {
    if (!isAssetRef(value)) return
    const hash = value.slice(ASSET_PREFIX.length)
    const cards = seen.get(hash) ?? []
    if (cardRef !== undefined && !cards.includes(cardRef)) cards.push(cardRef)
    seen.set(hash, cards)
  }
  for (const row of doc.rows) for (const v of Object.values(row.fields)) met(v, row.id)
  const walk = (els: ProjectDoc['template']['faces'][string]['base']) => {
    for (const el of els) {
      if (el.kind === 'image' && 'literal' in el.bind) met(el.bind.literal)
      if (el.kind === 'if' || el.kind === 'group') walk(el.children)
    }
  }
  for (const face of Object.values(doc.template.faces)) {
    walk(face.base)
    for (const v of Object.values(face.variants)) walk(v.override ?? [])
  }
  for (const block of doc.rules?.blocks ?? []) if (block.kind === 'image') met(block.asset)
  // And every picture the game says it has met, whether or not anything draws from it (#222,
  // beslut 5). A picture uploaded in the library points at nothing yet — no cell, no literal, no
  // block — so a library that only listed what it could see in use would lose a picture the
  // moment it arrived, which is the one place it must not.
  for (const hash of Object.keys(doc.pictures ?? {})) if (!seen.has(hash)) seen.set(hash, [])
  return [...seen].map(([hash, cards]) => ({ hash, cards }))
}

// Every image the deck uses, once, with the cards it sits on, in the order first seen. The
// library above, less what nothing is drawn from: the card table's own strip is about the deck's
// pictures and has no place to say "nobody uses this".
export function assetsInUse(doc: ProjectDoc): { hash: string; cards: string[] }[] {
  return mediaInGame(doc).filter((picture) => picture.cards.length > 0)
}

// What a picture in the rulebook may weigh and what it may be (#173). A file a designer picks is
// untrusted input: what it is called, and the type a browser guessed from that name, are claims
// and not evidence — so the type is read out of the bytes, and a file whose bytes are not one of
// these four is refused rather than stored and served as something it is not. The book takes
// raster pictures only; a card's icon set may hold an SVG (E4), but that is a file the tool itself
// fetched from a library, and a drawing a designer brings from her own disk is not.
//
// The reading itself is `sniffAsset`, which is also the server's gate (#204): the check here
// exists to tell the designer at once that her file is not a picture, and a check in the browser
// is never what protects the service. Two readings of the same bytes that could disagree is one
// reading too many, so there is one — and the kinds are what keep a typeface out of a picture
// field, since a font's formats are its own and are not pictures.
//
// The weight is the server's own limit, for the same reason: asked here so the import report can
// say which picture was too big instead of one upload failing where nobody is reading.
export const RULE_IMAGE_MAX_BYTES = ASSET_MAX_BYTES

// How big the picture is in its own pixels, read out of the same bytes the type was read out of
// (#173). It is what the one measurement in millimetres is worked out from, and it is read from the
// header rather than by handing the file to the browser to decode: an import is not the place for
// an image decoder, a browser's answer arrives asynchronously and only where there is a document,
// and the header is the file's own statement of its size.
//
// A picture whose header does not say is a picture nobody can measure, and it is never guessed at:
// the import says the file could not be read rather than printing it at a size it invented.
export function imageSizeOf(bytes: Uint8Array): { w: number; h: number } | null {
  const be = (at: number): number => ((bytes[at] ?? 0) << 24) | ((bytes[at + 1] ?? 0) << 16) | ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0)
  const le16 = (at: number): number => (bytes[at] ?? 0) | ((bytes[at + 1] ?? 0) << 8)
  const type = imageTypeOf(bytes)
  // PNG: the IHDR chunk stands first and carries two big-endian longs.
  if (type === 'image/png') return bytes.length >= 24 ? sized(be(16), be(20)) : null
  // GIF: the logical screen descriptor follows the six bytes of the signature.
  if (type === 'image/gif') return bytes.length >= 10 ? sized(le16(6), le16(8)) : null
  // JPEG: the size lives in a frame header, and where that stands depends on what the encoder put
  // before it — so the segments are walked rather than counted. `SOF0`…`SOF15` are frames except
  // for the three markers in that range that are not (`DHT`, `JPG`, `DAC`).
  if (type === 'image/jpeg') {
    let at = 2
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) {
        at++
        continue
      }
      const marker = bytes[at + 1] ?? 0
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return sized(((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0), ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0))
      }
      at += 2 + (((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0))
    }
    return null
  }
  if (type === 'image/webp') {
    const chunk = String.fromCharCode(...bytes.slice(12, 16))
    // Three shapes, and each says it its own way: a lossy keyframe gives fourteen bits each after
    // the three-byte start code, a lossless stream packs the same two counts one less than the
    // size into the four bytes after its signature, and the extended form carries the canvas as
    // two three-byte counts, also one less. All three are read, because all four types the gate
    // accepts have to be measurable — a picture that cannot be measured does not come in.
    if (chunk === 'VP8 ' && bytes.length >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) return sized(le16(26) & 0x3fff, le16(28) & 0x3fff)
    if (chunk === 'VP8L' && bytes.length >= 25 && bytes[20] === 0x2f) {
      const packed = (le16(21) | (le16(23) << 16)) >>> 0
      return sized((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1)
    }
    if (chunk === 'VP8X' && bytes.length >= 30) return sized(le16(24) + ((bytes[26] ?? 0) << 16) + 1, le16(27) + ((bytes[29] ?? 0) << 16) + 1)
    return null
  }
  return null
}
const sized = (w: number, h: number): { w: number; h: number } | null => (w > 0 && h > 0 ? { w, h } : null)

export function imageTypeOf(bytes: Uint8Array): string | null {
  const format = sniffAsset(bytes)
  return format?.kind === 'image' ? format.type : null
}

// A data URL, as the wizard holds a chosen image, back to bytes and a type for upload. The
// bytes are copied into a buffer of their own, which is what a request body wants.
export function bytesOfDataUrl(dataUrl: string): { type: string; bytes: Uint8Array<ArrayBuffer> } | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl)
  if (!m) return null
  const decoded = m[2] ? Uint8Array.from(atob(m[3] ?? ''), (c) => c.charCodeAt(0)) : new TextEncoder().encode(decodeURIComponent(m[3] ?? ''))
  const bytes = new Uint8Array(decoded.length)
  bytes.set(decoded)
  return { type: m[1] ?? 'application/octet-stream', bytes }
}

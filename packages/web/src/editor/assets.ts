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

// Every image the deck uses, once, with the cards it sits on, in the order first seen.
export function assetsInUse(doc: ProjectDoc): { hash: string; cards: string[] }[] {
  const seen = new Map<string, string[]>()
  for (const row of doc.rows) {
    for (const v of Object.values(row.fields)) {
      if (!isAssetRef(v)) continue
      const hash = v.slice(ASSET_PREFIX.length)
      const cards = seen.get(hash) ?? []
      if (!cards.includes(row.id)) cards.push(row.id)
      seen.set(hash, cards)
    }
  }
  return [...seen].map(([hash, cards]) => ({ hash, cards }))
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

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

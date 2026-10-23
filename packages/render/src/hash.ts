import { createHash } from 'node:crypto'

// A booklet (B7) is a document of many pages rather than one card, so it is a kind of its own:
// it is rendered differently and must never share a cache key with a card's PDF. A raster is a
// partner's file (#1207): the whole page in exactly the pixels and the format its requirements
// name, so one card in two partners' forms is two renderings and in one form is one.
export type RenderKind = { kind: 'png'; dpi: number } | { kind: 'raster'; format: 'png' | 'jpg'; widthPx: number; heightPx: number } | { kind: 'pdf' } | { kind: 'booklet' }
export type CompiledLike = { html: string; css: string }

// The cache key for a rendering (DRIFT §6): the same compiled output with the same options
// is the same picture, so it is rendered once and stored under this hash.
export function contentHash(compiled: CompiledLike, kind: RenderKind): string {
  const h = createHash('sha256')
  h.update(kind.kind === 'png' ? `png:${kind.dpi}\n` : kind.kind === 'raster' ? `raster:${kind.format}:${kind.widthPx}x${kind.heightPx}\n` : `${kind.kind}\n`)
  h.update(compiled.css)
  h.update('\n--\n')
  h.update(compiled.html)
  return h.digest('hex')
}

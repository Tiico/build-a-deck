import { createHash } from 'node:crypto'

// A booklet (B7) is a document of many pages rather than one card, so it is a kind of its own:
// it is rendered differently and must never share a cache key with a card's PDF. A raster is a
// partner's file (#1207): the whole page in exactly the pixels and the format its requirements
// name, so one card in two partners' forms is two renderings and in one form is one. A screening
// (F4, #1271) draws no card: it draws one uploaded picture at most `maxPx` across and hands the
// pixels to the classifier it names, and what it keeps is a result, not an output.
export type RenderKind =
  | { kind: 'png'; dpi: number }
  | { kind: 'raster'; format: 'png' | 'jpg'; widthPx: number; heightPx: number }
  | { kind: 'pdf' }
  | { kind: 'booklet' }
  | { kind: 'screen'; asset: string; classifier: { id: string; version: string }; maxPx: number }
export type CompiledLike = { html: string; css: string }

// The cache key for a rendering (DRIFT §6): the same compiled output with the same options
// is the same picture, so it is rendered once and stored under this hash.
export function contentHash(compiled: CompiledLike, kind: RenderKind): string {
  const h = createHash('sha256')
  h.update(kindLine(kind))
  h.update(compiled.css)
  h.update('\n--\n')
  h.update(compiled.html)
  return h.digest('hex')
}

function kindLine(kind: RenderKind): string {
  switch (kind.kind) {
    case 'png':
      return `png:${kind.dpi}\n`
    case 'raster':
      return `raster:${kind.format}:${kind.widthPx}x${kind.heightPx}\n`
    case 'screen':
      return `screen:${kind.classifier.id}@${kind.classifier.version}:${kind.maxPx}:${kind.asset}\n`
    default:
      return `${kind.kind}\n`
  }
}

import { createHash } from 'node:crypto'

export type RenderKind = { kind: 'png'; dpi: number } | { kind: 'pdf' }
export type CompiledLike = { html: string; css: string }

// The cache key for a rendering (DRIFT §6): the same compiled output with the same options
// is the same picture, so it is rendered once and stored under this hash.
export function contentHash(compiled: CompiledLike, kind: RenderKind): string {
  const h = createHash('sha256')
  h.update(kind.kind === 'png' ? `png:${kind.dpi}\n` : 'pdf\n')
  h.update(compiled.css)
  h.update('\n--\n')
  h.update(compiled.html)
  return h.digest('hex')
}

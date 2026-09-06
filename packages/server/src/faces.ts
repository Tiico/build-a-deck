import type { SetupDef, TypeRegistry } from '@byd/engine'
import type { FaceHashes } from '@byd/engine'
import { compileCard, type Row, type Template } from '@byd/template'
import { contentHash, type RenderRequest } from '@byd/render/queue'

export type Deck = { template: Template; rows: Record<string, Row>; icons: Record<string, string> }

// Compiles every card in the setup once per face and keys the textures by content hash
// (DRIFT §6): the same face on three copies is one rendering, and a card that did not change
// between versions is not rendered again.
export function facesOf(deck: Deck, setup: SetupDef, registry: TypeRegistry, dpi: number, now: number): { faces: FaceHashes; jobs: RenderRequest[] } {
  const faces: FaceHashes = {}
  const jobs = new Map<string, RenderRequest>()
  for (const spec of setup.components) {
    if (faces[spec.cardRef]) continue
    const row = deck.rows[spec.cardRef]
    if (!row) continue
    const compiled = compileCard({ template: deck.template, type: registry.get(spec.type), row, icons: deck.icons })
    const perFace: Record<string, string> = {}
    for (const [face, out] of Object.entries(compiled)) {
      const hash = contentHash(out, { kind: 'png', dpi })
      perFace[face] = hash
      if (!jobs.has(hash)) jobs.set(hash, { hash, kind: { kind: 'png', dpi }, priority: 'texture', compiled: { html: out.html, css: out.css }, requestedAt: now })
    }
    faces[spec.cardRef] = perFace
  }
  return { faces, jobs: [...jobs.values()] }
}

import type { SetupDef, TypeRegistry } from '@byd/engine'
import type { FaceHashes } from '@byd/engine'
import { compileCard, type Row, type Template } from '@byd/template'
import { contentHash, type RenderRequest } from '@byd/render/queue'

export type Deck = { template: Template; rows: Record<string, Row>; icons: Record<string, string> }
export type PrintCard = { cardRef: string; faces: Record<string, string> }
export type PrintExport = { cards: PrintCard[]; jobs: RenderRequest[] }

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

// The print hand-off is deliberately card-shaped, not two unrelated lists of faces. Each entry
// is one physical component from setup and both hashes come from one compileCard call with the
// same row, so a group's front can never be paired with the base back (or another group's back).
// Identical copies keep their own manifest entries while their content-addressed render jobs are
// shared. The ordinary compiler is also the print compiler; bleed is its only print-time option.
export function printExportOf(deck: Deck, setup: SetupDef, registry: TypeRegistry, now: number): PrintExport {
  const cards: PrintCard[] = []
  const jobs = new Map<string, RenderRequest>()
  for (const spec of setup.components) {
    const row = deck.rows[spec.cardRef]
    if (!row) throw new Error(`deck has no row "${spec.cardRef}" for print`)
    const compiled = compileCard({ template: deck.template, type: registry.get(spec.type), row, icons: deck.icons, bleed: true })
    const faces: Record<string, string> = {}
    for (const [face, out] of Object.entries(compiled)) {
      const hash = contentHash(out, { kind: 'pdf' })
      faces[face] = hash
      if (!jobs.has(hash)) jobs.set(hash, { hash, kind: { kind: 'pdf' }, priority: 'print', compiled: { html: out.html, css: out.css }, requestedAt: now })
    }
    cards.push({ cardRef: spec.cardRef, faces })
  }
  return { cards, jobs: [...jobs.values()] }
}

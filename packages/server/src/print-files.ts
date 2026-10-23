import { typeKey, type ComponentTypeDef, type SetupDef, type TypeRegistry } from '@byd/engine'
import type { FileSource, PreparedFile, PreparedOrder, PrintManifest } from '@byd/print'
import { contentHash, type RenderKind, type RenderRequest, type RenderStore } from '@byd/render/queue'
import { compileRow, type Deck } from './faces.js'

// The platform's side of a print partner (F2, #1207): the game as a provider is handed it, and the
// files the provider's `prepare` names, drawn after its `requirements()` by the one compiler and
// the one renderer (E2) — the bleed in its millimetres, a raster in exactly its pixels or a PDF of
// exactly its page — and never after the type's fixed 3 mm.

export type PrintFileJob = { name: string; job: RenderRequest }

// One entry per physical card, as `printExportOf` lists them, each side named by what it shows: the
// hash of the face compiled without bleed, so two cards whose side is the same picture are one
// file to the partner whatever bleed it asks for. A die is hardware, by type and count (#1140), and
// a seat's counter is a token and no card at all (C4).
export function printManifestOf(deck: Deck, setup: SetupDef, registry: TypeRegistry): PrintManifest {
  const cards: PrintManifest['cards'] = []
  const hardware = new Map<string, PrintManifest['hardware'][number]>()
  for (const spec of setup.components) {
    const type = registry.get(spec.type)
    if (type.print.stock) {
      const seen = hardware.get(typeKey(spec.type))
      if (seen) seen.count++
      else hardware.set(typeKey(spec.type), { type: { id: spec.type.id, version: spec.type.version }, count: 1 })
      continue
    }
    if (spec.counter !== undefined) continue
    const row = deck.rows[spec.cardRef]
    if (!row) throw new Error(`deck has no row "${spec.cardRef}" for print`)
    const faces = Object.fromEntries(Object.entries(compileRow(deck, type, row)).map(([face, page]) => [face, contentHash(page, { kind: 'pdf' })]))
    cards.push({ cardRef: spec.cardRef, type: { id: spec.type.id, version: spec.type.version }, faces })
  }
  return { cards, hardware: [...hardware.values()] }
}

// Each file of a prepared order as the render job that draws it, in the order's own order. The
// same file for the same requirements is the same job, and the same card for another partner is
// another (DRIFT §6): the bleed is in the compiled page, and the pixels and format in the kind.
export function printFileJobsOf(deck: Deck, registry: TypeRegistry, order: PreparedOrder, now: number): PrintFileJob[] {
  return order.files.map((file) => {
    const type = registry.get(file.type)
    drawable(file, type)
    const row = deck.rows[file.cardRef]
    if (!row) throw new Error(`deck has no row "${file.cardRef}" for print`)
    const page = compileRow(deck, type, row, file.bleedMm)[file.face]
    if (!page) throw new Error(`${typeKey(file.type)} has no face "${file.face}"`)
    const kind = kindOf(file)
    const compiled = { html: page.html, css: page.css }
    return { name: file.name, job: { hash: contentHash(compiled, kind), kind, priority: 'print', compiled, requestedAt: now } }
  })
}

// The drawn files by the names the order gave them, as `submit` and the print package read them.
export function renderedFiles(jobs: readonly PrintFileJob[], renders: RenderStore, ttlSeconds = 3600): FileSource {
  const hashOf = (name: string): string => {
    const found = jobs.find((j) => j.name === name)
    if (!found) throw new Error(`the order has no file "${name}"`)
    return found.job.hash
  }
  return {
    async bytes(name) {
      const bytes = await renders.output(hashOf(name))
      if (!bytes) throw new Error(`"${name}" is not drawn yet`)
      return bytes
    },
    async url(name) {
      const link = await renders.link(hashOf(name), ttlSeconds)
      if (!link) throw new Error(`"${name}" has no link`)
      return link
    },
  }
}

// What the one renderer can draw for a partner. The card is drawn at its type's own size and never
// scaled to another (#1199, question 8); and CMYK is not built: E2 says it is an ICC conversion
// after the render, and which partner wants it and how is open (#1207). A partner that asks for
// either is told no here, out loud, rather than sent sRGB or a stretched card in silence.
function drawable(file: PreparedFile, type: ComponentTypeDef): void {
  const { widthMm, heightMm } = type.physical
  if (file.trim.widthMm !== widthMm || file.trim.heightMm !== heightMm) {
    throw new Error(`${typeKey(file.type)} is ${widthMm} × ${heightMm} mm; a trim of ${file.trim.widthMm} × ${file.trim.heightMm} mm is another type`)
  }
  if (file.colorSpace !== 'sRGB') throw new Error(`${file.name} is asked for in ${file.colorSpace}, and the renderer draws sRGB: CMYK is an ICC step that is not built (E2, #1207)`)
}

function kindOf(file: PreparedFile): RenderKind {
  if (file.file.kind === 'vector') return { kind: 'pdf' }
  const { format, widthPx, heightPx } = file.file
  return { kind: 'raster', format, widthPx, heightPx }
}

import type { SetupDef, TypeRegistry } from '@byd/engine'
import type { CardTitles, FaceHashes } from '@byd/engine'
import { compileCard, type Motif, type Nudge, type Row, type Template } from '@byd/template'
import { contentHash, type RenderRequest } from '@byd/render/queue'
import { titleOfFields } from './names.js'

// `fonts` is what the version is pinned to (B3), already resolved to something a page can load.
// "motifs" is what is drawn inside each picture (E1), keyed by the URL the rows carry: an image
// element told to trim fits the motif rather than the file, so the same motif is the same size on
// every card however much air its own file happens to have.
// "palette" is what the game's meanings are painted in (E4) and "framing" is what each card asks
// of its template's measure (E1), keyed by card and then by the column the picture sits in.
export type Deck = {
  template: Template
  rows: Record<string, Row>
  icons: Record<string, string>
  palette?: Record<string, string>
  framing?: Record<string, Record<string, Nudge>>
  fonts?: Record<string, { stack: string; src?: string }>
  motifs?: Record<string, Motif>
}
// What this one card adds to the compile: the palette is the whole deck's, the departure is its
// own. One place builds it, so the texture and the print cannot disagree about either (E2).
const forCard = (deck: Deck, cardRef: string) => ({
  ...(deck.palette ? { palette: deck.palette } : {}),
  ...(deck.framing?.[cardRef] ? { framing: deck.framing[cardRef] } : {}),
})

export type PrintCard = { cardRef: string; faces: Record<string, string> }
export type PrintExport = { cards: PrintCard[]; jobs: RenderRequest[] }

// Compiles every card in the setup once per face and keys the textures by content hash
// (DRIFT §6): the same face on three copies is one rendering, and a card that did not change
// between versions is not rendered again.
//
// The same pass reads out what each card is called (#412). It is the one place the deck is read
// per table, so the word and the picture are taken from the same row of the same compiled deck
// and cannot drift apart; `project` then filters both against the seat (B6).
export function facesOf(deck: Deck, setup: SetupDef, registry: TypeRegistry, dpi: number, now: number): { faces: FaceHashes; titles: CardTitles; jobs: RenderRequest[] } {
  const faces: FaceHashes = {}
  const titles: CardTitles = {}
  const jobs = new Map<string, RenderRequest>()
  for (const spec of setup.components) {
    if (faces[spec.cardRef]) continue
    const row = deck.rows[spec.cardRef]
    if (!row) continue
    // The designer's title with its capitals and its diacritics (#412). A row that has none says
    // nothing here, and the card keeps being named by its id at the reader, as it always was.
    const title = titleOfFields(row)
    if (title !== '') titles[spec.cardRef] = title
    const compiled = compileCard({ template: deck.template, type: registry.get(spec.type), row, icons: deck.icons, ...forCard(deck, spec.cardRef), ...(deck.fonts ? { fonts: deck.fonts } : {}), ...(deck.motifs ? { motifs: deck.motifs } : {}) })
    const perFace: Record<string, string> = {}
    for (const [face, out] of Object.entries(compiled)) {
      const hash = contentHash(out, { kind: 'png', dpi })
      perFace[face] = hash
      if (!jobs.has(hash)) jobs.set(hash, { hash, kind: { kind: 'png', dpi }, priority: 'texture', compiled: { html: out.html, css: out.css }, requestedAt: now })
    }
    faces[spec.cardRef] = perFace
  }
  return { faces, titles, jobs: [...jobs.values()] }
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
    // A seat's counter is a token, not a card (C4): it names no row of the deck and there is
    // nothing card-shaped to print for it.
    if (spec.counter !== undefined) continue
    const row = deck.rows[spec.cardRef]
    if (!row) throw new Error(`deck has no row "${spec.cardRef}" for print`)
    const compiled = compileCard({ template: deck.template, type: registry.get(spec.type), row, icons: deck.icons, bleed: true, ...forCard(deck, spec.cardRef), ...(deck.fonts ? { fonts: deck.fonts } : {}), ...(deck.motifs ? { motifs: deck.motifs } : {}) })
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

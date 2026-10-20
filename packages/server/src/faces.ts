import type { SetupDef, TypeRegistry } from '@byd/engine'
import type { CardTexts, CardTitles, FaceHashes } from '@byd/engine'
import { compileCard, printedText, type Motif, type Row, type Template } from '@byd/template'
import { contentHash, type RenderRequest } from '@byd/render/queue'
import { titleOfFields } from './names.js'

// `fonts` is what the version is pinned to (B3), already resolved to something a page can load.
// "motifs" is what is drawn inside each picture (E1), keyed by the URL the rows carry: an image
// element told to trim fits the motif rather than the file, so the same motif is the same size on
// every card however much air its own file happens to have.
// "palette" is what the game's meanings are painted in (E4).
export type Deck = {
  template: Template
  rows: Record<string, Row>
  icons: Record<string, string>
  palette?: Record<string, string>
  fonts?: Record<string, { stack: string; src?: string }>
  motifs?: Record<string, Motif>
}

export type PrintCard = { cardRef: string; faces: Record<string, string> }
export type PrintExport = { cards: PrintCard[]; jobs: RenderRequest[] }

// Compiles every card in the setup once per face and keys the textures by content hash
// (DRIFT §6): the same face on three copies is one rendering, and a card that did not change
// between versions is not rendered again.
//
// The same pass reads out what each card is called (#412). It is the one place the deck is read
// per table, so the word and the picture are taken from the same row of the same compiled deck
// and cannot drift apart; `project` then filters both against the seat (B6). What the card prints
// beside its title (#551) is read in the same pass, off the face the texture is drawn from.
export type CompiledFaces = { faces: FaceHashes; titles: CardTitles; texts: CardTexts }

// One card at a time, and only as fast as it is asked for (#1012). A page names the deck's pictures
// and typefaces by hash since #1028, and is kilobytes; but a deck made before that carries them as
// data URLs, and 308 illustrated cards in two uploaded typefaces were 400 MB of pages: a pass that
// compiled them all before handing any on held all of them at once, and took the app past its heap
// at the start of a table. Each card's new jobs are yielded before the next card is compiled, so a
// page lives only until it is queued.
function* compiledCards(deck: Deck, setup: SetupDef, registry: TypeRegistry, dpi: number, now: number, out: CompiledFaces): Generator<RenderRequest> {
  const seen = new Set<string>()
  for (const spec of setup.components) {
    if (out.faces[spec.cardRef]) continue
    const row = deck.rows[spec.cardRef]
    if (!row) continue
    // The designer's title with its capitals and its diacritics (#412). A row that has none says
    // nothing here, and the card keeps being named by its id at the reader, as it always was.
    const title = titleOfFields(row)
    if (title !== '') out.titles[spec.cardRef] = title
    // The words of the face a view that may see the card is shown: its content face (#551, K27).
    const content = deck.template.faces[registry.get(spec.type).contentFace]
    if (content) out.texts[spec.cardRef] = printedText({ face: content, row })
    const compiled = compileCard({ template: deck.template, type: registry.get(spec.type), row, icons: deck.icons, ...(deck.palette ? { palette: deck.palette } : {}), ...(deck.fonts ? { fonts: deck.fonts } : {}), ...(deck.motifs ? { motifs: deck.motifs } : {}) })
    const perFace: Record<string, string> = {}
    out.faces[spec.cardRef] = perFace
    for (const [face, page] of Object.entries(compiled)) {
      const hash = contentHash(page, { kind: 'png', dpi })
      perFace[face] = hash
      if (seen.has(hash)) continue
      seen.add(hash)
      yield { hash, kind: { kind: 'png', dpi }, priority: 'texture', compiled: { html: page.html, css: page.css }, requestedAt: now }
    }
  }
}

// Every card's faces, each new job handed to `queue` — and waited for — before the next card is
// compiled (#1012). `hashes` is every texture the deck needs, in the order they were queued.
export async function queueFaces(deck: Deck, setup: SetupDef, registry: TypeRegistry, dpi: number, now: number, queue: (job: RenderRequest) => Promise<unknown>): Promise<CompiledFaces & { hashes: string[] }> {
  const out: CompiledFaces = { faces: {}, titles: {}, texts: {} }
  const hashes: string[] = []
  for (const job of compiledCards(deck, setup, registry, dpi, now, out)) {
    hashes.push(job.hash)
    await queue(job)
  }
  return { ...out, hashes }
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
    const compiled = compileCard({ template: deck.template, type: registry.get(spec.type), row, icons: deck.icons, bleed: true, ...(deck.palette ? { palette: deck.palette } : {}), ...(deck.fonts ? { fonts: deck.fonts } : {}), ...(deck.motifs ? { motifs: deck.motifs } : {}) })
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

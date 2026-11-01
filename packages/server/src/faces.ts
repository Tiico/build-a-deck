import { isMaterial, type ComponentTypeDef, type SetupDef, type TypeRegistry } from '@byd/engine'
import type { CardTexts, CardTitles, FaceHashes } from '@byd/engine'
import { compileCard, printedText, type Compiled, type Motif, type Row, type Template } from '@byd/template'
import { contentHash, type RenderKind, type RenderRequest } from '@byd/render/queue'
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
  // The boards' own templates (#1479, L91), a face per side, under the board's name in the document,
  // which is its `cardRef` at the table. Drawn with the deck's icons, palette, fonts and motifs, since
  // a board is designed with the same tools as a card.
  boards?: Record<string, Template>
}

// One row of the deck through the one compiler (E2), every face of it, with whatever the deck
// carries for it to be drawn with. `bleed` is the compiler's one print option: the type's own for
// `true`, or the millimetres a partner asks for (#1207).
export function compileRow(deck: Deck, type: ComponentTypeDef, row: Row, bleed: boolean | number = false): Record<string, Compiled> {
  return compileCard({ template: deck.template, type, row, icons: deck.icons, ...(bleed === false ? {} : { bleed }), ...(deck.palette ? { palette: deck.palette } : {}), ...(deck.fonts ? { fonts: deck.fonts } : {}), ...(deck.motifs ? { motifs: deck.motifs } : {}) })
}

export type PrintCard = { cardRef: string; faces: Record<string, string> }
// Hardware is what the partner packs rather than prints (#1140): a stock die, by type and count.
export type PrintHardware = { type: string; count: number }
export type PrintExport = { cards: PrintCard[]; jobs: RenderRequest[]; hardware: PrintHardware[] }

// Compiles every card in the setup once per face and keys the textures by content hash
// (DRIFT §6): the same face on three copies is one rendering, and a card that did not change
// between versions is not rendered again.
//
// The same pass reads out what each card is called (#412). It is the one place the deck is read
// per table, so the word and the picture are taken from the same row of the same compiled deck
// and cannot drift apart; `project` then filters both against the seat (B6). What the card prints
// beside its title (#551) is read in the same pass, off the face the texture is drawn from.
//
// A board's side (#1479) is compiled in the same pass, from its own template and in the board's own
// size, at the same dpi as a card's, so the felt draws it at the same pixels per millimetre. It goes
// in `ownFaces`, never `faces`: a row and a board may share a word without sharing a face.
export type CompiledFaces = { faces: FaceHashes; titles: CardTitles; texts: CardTexts; ownFaces: FaceHashes }

// One card at a time, and only as fast as it is asked for (#1012). A page names the deck's pictures
// and typefaces by hash since #1028, and is kilobytes; but a deck made before that carries them as
// data URLs, and 308 illustrated cards in two uploaded typefaces were 400 MB of pages: a pass that
// compiled them all before handing any on held all of them at once, and took the app past its heap
// at the start of a table. Each card's new jobs are yielded before the next card is compiled, so a
// page lives only until it is queued.
// The felt's own picture of a board (#1480, beställarens beslut 2026-11-01): a JPEG at quality 90,
// at most 2048 px on its long side and never denser than a card's texture, so the felt draws it at
// a card's pixels per millimetre or fewer. A big board in a card's 150 DPI was 3602 × 2699 px, and a
// PNG of a photograph on it tens of megabytes for every screen that draws the felt. The print keeps
// the type's own resolution (#1488); this is the table's.
export const BOARD_TEXTURE_MAX_PX = 2048
export const BOARD_TEXTURE_QUALITY = 90
export function boardTextureKind(def: ComponentTypeDef, dpi: number): RenderKind {
  const { widthMm, heightMm } = def.physical
  const perMm = Math.min(dpi / 25.4, BOARD_TEXTURE_MAX_PX / Math.max(widthMm, heightMm))
  return { kind: 'raster', format: 'jpg', quality: BOARD_TEXTURE_QUALITY, widthPx: Math.round(widthMm * perMm), heightPx: Math.round(heightMm * perMm) }
}

function* compiledCards(deck: Deck, setup: SetupDef, registry: TypeRegistry, dpi: number, now: number, out: CompiledFaces): Generator<RenderRequest> {
  const seen = new Set<string>()
  const job = (page: Compiled, perFace: Record<string, string>, face: string, kind: RenderKind = { kind: 'png', dpi }): RenderRequest | undefined => {
    const hash = contentHash(page, kind)
    perFace[face] = hash
    if (seen.has(hash)) return undefined
    seen.add(hash)
    return { hash, kind, priority: 'texture', compiled: { html: page.html, css: page.css }, requestedAt: now }
  }
  for (const spec of setup.components) {
    const def = registry.get(spec.type)
    if (def.ownFaces) {
      const template = deck.boards?.[spec.cardRef]
      if (out.ownFaces[spec.cardRef] || !template || Object.keys(template.faces).length === 0) continue
      const perFace: Record<string, string> = {}
      out.ownFaces[spec.cardRef] = perFace
      for (const [face, page] of Object.entries(compileRow({ ...deck, template }, def, {}))) {
        const next = job(page, perFace, face, boardTextureKind(def, dpi))
        if (next) yield next
      }
      continue
    }
    if (out.faces[spec.cardRef]) continue
    // Material is no card (K32, #1471): a meeple's `cardRef` is its seat and a counter's its name, so
    // a row that shares the word is not theirs, and has no face of theirs to draw.
    if (isMaterial(registry.get(spec.type))) continue
    const row = deck.rows[spec.cardRef]
    if (!row) continue
    // The designer's title with its capitals and its diacritics (#412). A row that has none says
    // nothing here, and the card keeps being named by its id at the reader, as it always was.
    const title = titleOfFields(row)
    if (title !== '') out.titles[spec.cardRef] = title
    // The words of the face a view that may see the card is shown: its content face (#551, K27).
    const content = deck.template.faces[registry.get(spec.type).contentFace]
    if (content) out.texts[spec.cardRef] = printedText({ face: content, row })
    const compiled = compileRow(deck, registry.get(spec.type), row)
    const perFace: Record<string, string> = {}
    out.faces[spec.cardRef] = perFace
    for (const [face, page] of Object.entries(compiled)) {
      const next = job(page, perFace, face)
      if (next) yield next
    }
  }
}

// Every card's faces, each new job handed to `queue` — and waited for — before the next card is
// compiled (#1012). `hashes` is every texture the deck needs, in the order they were queued.
export async function queueFaces(deck: Deck, setup: SetupDef, registry: TypeRegistry, dpi: number, now: number, queue: (job: RenderRequest) => Promise<unknown>): Promise<CompiledFaces & { hashes: string[] }> {
  const out: CompiledFaces = { faces: {}, titles: {}, texts: {}, ownFaces: {} }
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
// This is the print where no partner is asked, so the bleed is the type's own; a partner's files
// are drawn after its own requirements in `print-files.ts` (#1207).
//
// A stock item, a die (#1140), is listed as hardware by kind in the order the game first names it,
// and printed as nothing. Whoever orders may leave the hardware out (`hardware: false`): many
// partners will not pack it, and a game is still a game of cards without it.
export function printExportOf(deck: Deck, setup: SetupDef, registry: TypeRegistry, now: number, opts: { hardware?: boolean } = {}): PrintExport {
  const cards: PrintCard[] = []
  const jobs = new Map<string, RenderRequest>()
  const hardware = new Map<string, number>()
  for (const spec of setup.components) {
    if (registry.get(spec.type).print.stock) {
      if (opts.hardware !== false) hardware.set(spec.type.id, (hardware.get(spec.type.id) ?? 0) + 1)
      continue
    }
    // A seat's counter is a token, not a card (C4): it names no row of the deck and there is
    // nothing card-shaped to print for it.
    if (spec.counter !== undefined) continue
    // A board (#1479) is drawn from its own template, not a row, and goes to print as #1488 says.
    if (registry.get(spec.type).ownFaces) continue
    const row = deck.rows[spec.cardRef]
    if (!row) throw new Error(`deck has no row "${spec.cardRef}" for print`)
    // The type's own bleed: this is the print where no partner is asked (G5's export, #1207).
    const compiled = compileRow(deck, registry.get(spec.type), row, true)
    const faces: Record<string, string> = {}
    for (const [face, out] of Object.entries(compiled)) {
      const hash = contentHash(out, { kind: 'pdf' })
      faces[face] = hash
      if (!jobs.has(hash)) jobs.set(hash, { hash, kind: { kind: 'pdf' }, priority: 'print', compiled: { html: out.html, css: out.css }, requestedAt: now })
    }
    cards.push({ cardRef: spec.cardRef, faces })
  }
  return { cards, jobs: [...jobs.values()], hardware: [...hardware].map(([type, count]) => ({ type, count })) }
}

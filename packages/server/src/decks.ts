// Imported by the editor as well as the server, so this module stays free of anything Node: types
// only from the project document.
import { CARD_STANDARD_63x88, TILES, type ComponentTypeDef } from '@byd/engine'
import type { TypeRef } from '@byd/protocol'
import type { FaceTemplate, Template } from '@byd/template'
import type { ProjectDoc, ProjectRow } from './projects.js'

// The game's decks (#1484), every one read the same way. The document's own deck is the one it has
// always had (`template`, `rows`, `columns`, the standard card, laid in `setup.deckZone`), and its
// `id` is null: nothing written before there was more than one deck names it. Every other deck stands
// in `decks` with its type, template, rows, column order and the pile it starts in. Read, never
// written back: a document is never rewritten to say what it already says (B4).
export type GameDeck = { id: string | null; name?: string; type: TypeRef; template: Template; rows: ProjectRow[]; columns?: string[] | undefined; zone: string }
export function decksOf(doc: Pick<ProjectDoc, 'template' | 'rows' | 'columns' | 'setup' | 'decks'>): [GameDeck, ...GameDeck[]] {
  const own: GameDeck = { id: null, type: { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }, template: doc.template, rows: doc.rows, ...(doc.columns ? { columns: doc.columns } : {}), zone: doc.setup.deckZone }
  return [own, ...(doc.decks ?? [])]
}

// The name a row goes by at the table (#1484): its own id in the document's own deck, as it always
// was, and in another deck the deck's id before it, so two decks may each have a row «1» and the two
// never share a face, a title or a texture. The document refuses a row of its own deck that goes by
// the name of a row of another (`ProjectDoc`).
export const rowRef = (deck: string | null, row: string): string => (deck === null ? row : `${deck}:${row}`)

// The name a deck's template goes by in the table's `Deck` (`templates`, `drawnWith`).
export const deckTemplateName = (deck: string): string => `deck:${deck}`

// What a deck's tab in the editor draws and edits (#1487, #1474 A): every deck the game has, the
// document's own first, and every marker's two sides, each by the name its edits carry in `deck`
// (null for the document's own, the deck's id, `marker:<id>` for a marker's sides) and the type it is
// made as. A marker has a template and no rows.
export type DeckTab = { ref: string | null; kind: 'deck' | 'marker'; name?: string; type: ComponentTypeDef; rows: number }
export const MARKER_REF = 'marker:'
const typeOf = (ref: TypeRef): ComponentTypeDef => [CARD_STANDARD_63x88, ...TILES].find((d) => d.id === ref.id && d.version === ref.version) ?? CARD_STANDARD_63x88
export function deckTabs(doc: Pick<ProjectDoc, 'template' | 'rows' | 'columns' | 'setup' | 'decks'>): [DeckTab, ...DeckTab[]] {
  const tab = (d: GameDeck): DeckTab => ({ ref: d.id, kind: 'deck', ...(d.name ? { name: d.name } : {}), type: typeOf(d.type), rows: d.rows.length })
  const [own, ...others] = decksOf(doc)
  const markers = (doc.setup.markers ?? []).map((m): DeckTab => ({ ref: `${MARKER_REF}${m.id}`, kind: 'marker', name: m.name, type: typeOf(m.type), rows: 0 }))
  return [tab(own), ...others.map(tab), ...markers]
}

// The document as one deck's tab sees it (#1487): that deck's template, rows and column order in the
// document's own place, and everything else the game's. The document itself for its own deck, and
// the same document for a deck or a marker it no longer has, so a tab that outlives its deck draws
// the game's own rather than nothing. A marker's sides are every side its type has, a blank one where
// nothing is drawn yet.
const BLANK: FaceTemplate = { base: [], variants: {} }
export function deckView(doc: ProjectDoc, ref: string | null): ProjectDoc {
  if (ref === null) return doc
  const { columns: _own, ...shared } = doc
  if (ref.startsWith(MARKER_REF)) {
    const marker = doc.setup.markers?.find((m) => m.id === ref.slice(MARKER_REF.length))
    if (!marker) return doc
    const sides = typeOf(marker.type).faces
    return { ...shared, rows: [], template: { faces: Object.fromEntries(sides.map((f) => [f, marker.faces?.[f as keyof typeof marker.faces] ?? BLANK])) } }
  }
  const deck = doc.decks?.find((d) => d.id === ref)
  if (!deck) return doc
  return { ...shared, template: deck.template, rows: deck.rows, ...(deck.columns ? { columns: deck.columns } : {}) }
}

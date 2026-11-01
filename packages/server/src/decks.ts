// Imported by the editor as well as the server, so this module stays free of anything Node: types
// only from the project document.
import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { TypeRef } from '@byd/protocol'
import type { Template } from '@byd/template'
import type { ProjectDoc, ProjectRow } from './projects.js'

// The game's decks (#1484), every one read the same way. The document's own deck is the one it has
// always had (`template`, `rows`, `columns`, the standard card, laid in `setup.deckZone`), and its
// `id` is null: nothing written before there was more than one deck names it. Every other deck stands
// in `decks` with its type, template, rows, column order and the pile it starts in. Read, never
// written back: a document is never rewritten to say what it already says (B4).
export type GameDeck = { id: string | null; name?: string; type: TypeRef; template: Template; rows: ProjectRow[]; columns?: string[] | undefined; zone: string }
export function decksOf(doc: Pick<ProjectDoc, 'template' | 'rows' | 'columns' | 'setup' | 'decks'>): GameDeck[] {
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

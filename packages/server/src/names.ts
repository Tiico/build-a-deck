// Imported by the editor as well as the server, so this module stays free of anything Node:
// types only from the project document, and no imports that reach the database or the network.
import type { ProjectDoc, ProjectRow } from './projects.js'
import type { Names } from '@byd/template'

// What the rulebook's references stand for right now (B7): zones by the name the table shows,
// cards by their title. A card without a title falls back to its id, so a reference is never
// empty on the page.
export function namesOfProject(doc: ProjectDoc): Names {
  const zones: Record<string, string> = {}
  for (const zone of doc.setup.zones) zones[zone.id] = zone.name
  const cards: Record<string, string> = {}
  for (const row of doc.rows) cards[row.id] = titleOfRow(row)
  return { zones, cards }
}

// What a card is called, with its id behind it when nobody has given it a title yet.
export function titleOfRow(row: ProjectRow): string {
  return String(row.fields['title'] ?? '').trim() || row.id
}

// The cards "Mina spel" fans out on a game's card (G1): a few of the game's own cards rather
// than four rectangles that stand for nothing. They are spread evenly over the deck, first and
// last included, so a deck of a hundred shows its breadth and not only what was written first;
// the choice is the deck's order, so the same game looks the same every time it is listed.
export type CardPeek = { id: string; title: string }
export function peekCards(rows: readonly ProjectRow[], n = 4): CardPeek[] {
  const take = Math.min(n, rows.length)
  if (take === 0) return []
  const step = take === 1 ? 0 : (rows.length - 1) / (take - 1)
  const out: CardPeek[] = []
  for (let i = 0; i < take; i++) {
    const row = rows[Math.round(i * step)]
    if (row) out.push({ id: row.id, title: titleOfRow(row) })
  }
  return out
}

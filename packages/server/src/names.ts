// Imported by the editor as well as the server, so this module stays free of anything Node:
// types only from the project document, and no imports that reach the database or the network.
import type { ProjectDoc, ProjectRow } from './projects.js'
import type { Names, SetupArrangement, SetupSeat, SetupZone } from '@byd/template'

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

// How this game's table is laid out, as the book's setup block draws it (B5, #270).
//
// It is built here, beside the names, because both answers come out of the same document and a
// table's book has to read them out of the same version of it: the rulebook a session hands out is
// rendered against the revision the session was locked to at start (B7), and a setup read out of
// anything else would show the players a table they are not sitting at.
//
// Two zones stand apart only by what the zone itself says: a zone with no owner stands on the
// table for everybody, and a zone with one belongs to that seat. Nothing is read out of a name —
// a hand is called `Hand` at every seat, and a zone the designer called `Framför A` is at seat A
// because its `owner` says so and never because of how it is spelled.
//
// What travels is the id and the name and nothing else. Where a zone lies, who may see into it and
// what it fills with are the table's business and not the book's (B6, K15): the rulebook is handed
// to every seat and to whoever is only watching, so everything in it is public to all of them.
export function arrangementOf(doc: ProjectDoc): SetupArrangement {
  const common: SetupZone[] = []
  const owned = new Map<string, SetupZone[]>()
  // Every seat the table has, in the setup's own order, and each in the list whether or not it
  // owns anything: a seat with no zones of its own is a fact about the table, and a selector that
  // quietly skipped it would say the table has fewer places than it has.
  for (const seat of doc.setup.seats) owned.set(seat, [])
  for (const zone of doc.setup.zones) {
    const at: SetupZone = { id: zone.id, name: zone.name }
    if (zone.owner === undefined) common.push(at)
    // A zone owned by a seat that no longer sits at the table belongs to nobody (B5, reviderat),
    // and the recipe takes such zones away with the seat. One left behind by an older document is
    // still the designer's zone, so it is listed under the seat it names rather than dropped.
    else owned.set(zone.owner, [...(owned.get(zone.owner) ?? []), at])
  }
  const seats: SetupSeat[] = [...owned].map(([id, zones]) => ({ id, zones }))
  return { common, seats }
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

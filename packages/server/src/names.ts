// Imported by the editor as well as the server, so this module stays free of anything Node:
// types only from the project document, and no imports that reach the database or the network.
import type { ProjectDoc, ProjectFont, ProjectFraming, ProjectRow } from './projects.js'
import type { FaceTemplate, Names, Row, SetupArrangement, SetupSeat, SetupZone } from '@byd/template'

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

// What a row says its card is called, or nothing at all when the designer has not said (#412).
// One reading of «what is the title», so the rulebook, the editor's lists and the word the table
// speaks cannot come to different answers about the same row.
export function titleOfFields(fields: Row): string {
  return String(fields['title'] ?? '').trim()
}

// What a card is called, with its id behind it when nobody has given it a title yet.
export function titleOfRow(row: ProjectRow): string {
  return titleOfFields(row.fields) || row.id
}

// The card "Mina spel" shows on a game's card (G1, #231): the game's own first card rather than a
// rectangle that stands for nothing. It is the deck seen in the table's own order, so it is the
// same card at every visit for as long as the designer leaves the table in the order they put it
// in — and when they sort the table, it is they who moved the card and not the list that is
// restless. Id and title are all the list itself needs; what it takes to *draw* the card is
// `peekFace`, which the list deliberately does not carry.
export type CardPeek = { id: string; title: string }
export function peekCard(rows: readonly ProjectRow[]): CardPeek | null {
  const row = rows[0]
  return row ? { id: row.id, title: titleOfRow(row) } : null
}

// Everything it takes to draw that one card (G1, #231), and nothing more: the face, the row's own
// fields, and the few things about the game the compiler reads — its icons, the type it is set in
// (B3), what its meanings are painted in (E4) and what this card asks of the template's measure
// (E1). It is the deck wall's own material, so `CardPreview` is still the single code path that
// draws a card, in the list exactly as on the wall.
//
// It travels apart from the list and not inside it. The list is the first screen, and a template
// per game in it would make the first screen wait for every game's template before it drew a
// single name.
export type CardFace = {
  id: string
  title: string
  face: FaceTemplate
  row: Row
  icons: Record<string, string>
  fonts?: Record<string, ProjectFont>
  palette?: Record<string, string>
  framing?: Record<string, ProjectFraming>
}

// The front is the face a card is recognised by, and the one the editor opens on. A template that
// has no face at all has no card to draw, which is the same intentional empty state as a deck with
// no rows — not something broken.
export function peekFace(doc: ProjectDoc): CardFace | null {
  const row = doc.rows[0]
  if (!row) return null
  const face = doc.template.faces['front'] ?? Object.values(doc.template.faces)[0]
  if (!face) return null
  // This card's departure from the measure only, keyed by the column the picture sits in — the
  // deck's whole `framing` is one entry per card per picture, and none of the rest is this card's.
  const framing: Record<string, ProjectFraming> = {}
  for (const [key, nudge] of Object.entries(doc.framing ?? {})) {
    const cut = key.indexOf('/')
    if (key.slice(0, cut) === row.id) framing[key.slice(cut + 1)] = nudge
  }
  return {
    id: row.id,
    title: titleOfRow(row),
    face,
    row: row.fields,
    icons: doc.icons,
    ...(doc.fonts ? { fonts: doc.fonts } : {}),
    ...(doc.palette ? { palette: doc.palette } : {}),
    ...(Object.keys(framing).length > 0 ? { framing } : {}),
  }
}

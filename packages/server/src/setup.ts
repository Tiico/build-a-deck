import { matches } from '@byd/protocol'
import { CARD_STANDARD_63x88, DICE, TOKEN_COUNTER, type SetupDef } from '@byd/engine'
import { layMaterial } from './material.js'
import type { ProjectDoc } from './projects.js'

// Imported by the editor as well as the server, so this module stays free of anything Node.
// The table setup a project plays with (L5): every row becomes `antal` copies (default 1) of the
// standard card, face down in the deck zone (L4). Row order is deck order until the first shuffle.
// The editor's preview of the table is built from the same function, so the deck the designer
// sees counted is the deck the players are dealt (#85).
export function setupFromProject(doc: Pick<ProjectDoc, 'rows' | 'setup'>): SetupDef {
  const type = { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }
  const components: SetupDef['components'] = []
  // Where a row starts is the designer's question and not this function's opinion (B5): the
  // first zone whose question the row answers takes it, in the document's own order, and a row
  // no zone asks for lies in the deck's pile as every row used to.
  const asked = doc.setup.zones.filter((z) => z.fill !== undefined && z.fill.length > 0)
  for (const { id: cardRef, fields } of doc.rows) {
    const copies = copiesOf(fields)
    const zone = asked.find((z) => matches(z.fill ?? [], fields))?.id ?? doc.setup.deckZone
    for (let i = 0; i < copies; i++) components.push({ type, cardRef, zone, face: 'back' })
  }
  // The game's material (#1292): every seat's counters (C4) at their start values, and the dice
  // (K5, #1136) one side up. The side is the document's and not a roll: a table is laid the same
  // way every time, and the first roll is a line in the log like every other (D4). Where each piece
  // lies is `layMaterial`'s answer, which the editor's felt asks too.
  const token = { id: TOKEN_COUNTER.id, version: TOKEN_COUNTER.version }
  for (const piece of layMaterial(doc.setup)) {
    const at = { x: piece.x, y: piece.y }
    if (piece.line.kind === 'counter') {
      components.push({ type: token, cardRef: piece.name ?? '', zone: piece.zone, face: 'front', counter: piece.counter ?? 0, ...at })
      continue
    }
    const def = DICE.find((t) => t.behaviours.rollable !== false && t.behaviours.rollable.faces === piece.faces)
    if (def) components.push({ type: { id: def.id, version: def.version }, cardRef: `d${piece.faces}`, zone: piece.zone, face: 'front', counter: 1, ...at })
  }
  // Optional keys that are present but undefined are dropped: the engine's types are exact.
  const zones: SetupDef['zones'] = doc.setup.zones.map((z) => ({
    id: z.id,
    kind: z.kind,
    name: z.name,
    visibility: z.visibility,
    geometry: z.geometry,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
    ...(z.returnTo !== undefined ? { returnTo: z.returnTo } : {}),
    ...(z.shortcut !== undefined ? { shortcut: z.shortcut } : {}),
    ...(z.beside !== undefined ? { beside: z.beside } : {}),
    ...(z.actions !== undefined && z.actions.length > 0 ? { actions: z.actions } : {}),
    // The pile's bottom card (K23): where in the pile it lies, and on which side, is the
    // engine's to settle when the table is built, so it is passed on and not placed here.
    ...(z.bottom !== undefined && z.kind === 'pile' ? { bottom: { ...z.bottom } } : {}),
  }))
  // What each row says in its own columns, so a question can be asked of the deck at the table
  // and not only when it is laid out (B5). Written as the designer reads a cell — the same
  // reading the table's own chips do — because that is what a question is written against. It is
  // as secret as the row's identity: nothing projects it (B6).
  const cards: NonNullable<SetupDef['cards']> = {}
  for (const { id, fields } of doc.rows) {
    cards[id] = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v).trim()]))
  }
  // Whether the game goes in turns (K30) is the designer's answer in Bord, and travels as it is.
  return { zones, seats: doc.setup.seats, floor: doc.setup.floor, components, cards, ...(doc.setup.turns ? { turns: doc.setup.turns } : {}) }
}

// How many copies of a card the deck holds (L4): `antal`, one when it is absent, and none when it
// is below zero or no number at all. The one reading of it, so the deck the table deals and the
// copies a ceiling counts (#1195) are the same number.
export function copiesOf(fields: Record<string, unknown>): number {
  return Math.max(0, Math.floor(Number(fields['antal'] ?? 1)) || 0)
}

// Whether the game is playable (#1415, L91, beställarens beslut 2026-10-27): its deck holds at least
// one card. A table without one has nothing to deal and nothing to draw (#751), so this is the one
// condition «Starta bord» stands on, in the editor, on Mina spel and at the server's door; and the
// box's tab comes with it (#1406, beslut 3).
export function playable(doc: Pick<ProjectDoc, 'rows'>): boolean {
  return doc.rows.some((row) => copiesOf(row.fields) > 0)
}

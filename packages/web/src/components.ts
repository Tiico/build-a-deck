import { CARD_STANDARD_63x88, DICE, TOKEN_COUNTER } from '@byd/engine'
import type { VisibleComponentState } from '@byd/protocol'

// What a thing on the table is, as against where it is (`zones.ts`) or how it got there
// (`table/drop.ts`). A component's type is a fact about the component, and the rooms that ask
// about it — the felt, the address, the phone's sheet, a seat's own pills — are four readers of
// one answer and not four answers.
//
// A counter is a component of a type of its own (C4): a value with one face, `stackable: false`
// and `flippable: false`, drawn as a chip rather than as a card. The id is the engine's to own,
// so it is read from `TOKEN_COUNTER` and never written out again here; a copy of a type id is a
// copy that can go stale on its own.
export const isCounter = (c: { type: { id: string } }): boolean => c.type.id === TOKEN_COUNTER.id

// A die is one of the engine's `DICE` (K28, #1136), and its kind is what a table calls it: «d6»,
// by its sides. Null for anything that is not a die. The ids are read from the registry, so a kind
// the engine does not have is not a die here either.
const DIE_KINDS = new Map(DICE.map((d) => [d.id, `d${d.behaviours.rollable === false ? 0 : d.behaviours.rollable.faces}`]))
export const dieKind = (c: { type: { id: string } }): string | null => DIE_KINDS.get(c.type.id) ?? null

// A piece that is not a card: a counter or a die. The phone draws each in a place of its own — the
// counters' pills, the dice's sheet — and never as a card in a row of cards.
export const isPiece = (c: { type: { id: string } }): boolean => isCounter(c) || dieKind(c) !== null

// A card the screen shows without the wire having handed it out (K23): a face-down bottom card
// held up to look at. It knows only what the zone said — that there is a card, and the back it
// wears — and it is a standard card because that is the one shape the felt draws a back on. It
// never travels: nothing serialises it, and its id names the place and not a card.
export function standIn(id: string, zone: string, back: string | undefined): VisibleComponentState {
  return { id, type: { id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version }, zone, face: 'back', x: 0, y: 0, rot: 0, cardRef: null, ...(back === undefined ? {} : { faces: { back } }) }
}

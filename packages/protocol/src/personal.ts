import type { Intent } from './intents.js'

// The fields of a log line that carry a person's own words (#1269, #1276): the name she sat down
// under, the name of someone watching, and what she wrote in a flag or on the notepad. Written
// down once, here, so that what the corpus anonymises and what a masking would mask is one list,
// and so that `test/personal.test.ts` can hold every other field of every intent and outcome to
// having been said not to be one.
//
// None of them is play. The engine asks only whether a seat has a name, whether a flag has an
// observer and whether a note is blank — so a field may be masked to `REDACTED` and every line
// still decides and applies as it did (`redactLine` in `@byd/engine`). Masking a line where it lies
// in the store is the one rewrite DRIFT §7 allows (G6, F7); the erasure that does it is #1279.
//
// `holds` says what kind of words they are, which is what a reader of an anonymised log needs to
// know to put a pseudonym in its place: the corpus numbers seats' names and says «(kommentar)» for
// a comment.
export type PersonalHolds = 'seat-name' | 'observer-name' | 'comment' | 'note'

type VerbOf<V extends Intent['v']> = Extract<Intent, { v: V }>
type TextFieldOf<V extends Intent['v']> = { [K in keyof VerbOf<V>]-?: K extends 'v' ? never : NonNullable<VerbOf<V>[K]> extends string ? K : never }[keyof VerbOf<V>]
export type PersonalField = { [V in Intent['v']]: { v: V; field: TextFieldOf<V> & string; holds: PersonalHolds } }[Intent['v']]

export const PERSONAL_FIELDS: readonly PersonalField[] = [
  { v: 'seat.claim', field: 'name', holds: 'seat-name' },
  { v: 'flag', field: 'note', holds: 'comment' },
  { v: 'flag', field: 'observer', holds: 'observer-name' },
  { v: 'note.add', field: 'text', holds: 'note' },
  { v: 'note.edit', field: 'text', holds: 'note' },
]

// What a masked field says instead. A value and not a word (A4): a character from Unicode's
// private-use area, which no keyboard writes, which is not a blank (a note is never blank) and
// which fits every field's bounds. A surface that meets it says so in the reader's language; and
// nobody may sit down under it (`seat.claim`, `POST /rooms/:code/join`), so the placeholder is
// never somebody's name.
export const REDACTED = ''

// Every other field of a line that can hold text, and why it is not a person's (#1276):
// - `id`: an identifier the engine or the server made — a component, a zone, a seat, a batch;
// - `face`: which side of a card, from the type's closed list;
// - `design`: the designer's own game, as the setup has it — a card's row and columns, a question
//   asked of them. Hers, and anonymised in the corpus as the game (#540), not as a person;
// - `engine`: a shape the engine owns, stored verbatim. A rewind's table is zones and components
//   and no seat (`Table` in `@byd/engine`), which `redact.test.ts` there holds by looking for a
//   name in one.
// Keyed `<verb>.<field>` for an intent and `outcome:<kind>.<field>` for an outcome.
export type Impersonal = 'id' | 'face' | 'design' | 'engine'
export const IMPERSONAL_FIELDS: Readonly<Record<string, Impersonal>> = {
  'move.component': 'id',
  'move.to': 'id',
  'rotate.component': 'id',
  'flip.component': 'id',
  'flip.face': 'face',
  'stack.component': 'id',
  'stack.onto': 'id',
  'split.pile': 'id',
  'split.to': 'id',
  'split.face': 'face',
  'split.which': 'design',
  'shuffle.pile': 'id',
  'draw.from': 'id',
  'draw.to': 'id',
  'draw.face': 'face',
  'draw.which': 'design',
  'deal.from': 'id',
  'deal.to': 'id',
  'deal.face': 'face',
  'roll.component': 'id',
  'setCounter.component': 'id',
  'peek.components': 'id',
  'showTo.components': 'id',
  'showTo.seats': 'id',
  'reveal.components': 'id',
  'movePile.pile': 'id',
  'movePile.to': 'id',
  'seat.claim.seat': 'id',
  'seat.release.seat': 'id',
  'rewind.confirm.proposal': 'id',
  'rewind.reject.proposal': 'id',
  'version.change.to': 'id',
  'version.change.components': 'design',
  'version.change.cards': 'design',
  'flag.component': 'id',
  'turn.give.seat': 'id',
  'note.edit.note': 'id',
  'note.check.note': 'id',
  'note.remove.note': 'id',
  'outcome:shuffle.rekey': 'id',
  'outcome:shuffle.order': 'id',
  'outcome:restore.table': 'engine',
}

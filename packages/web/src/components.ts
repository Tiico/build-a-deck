import { TOKEN_COUNTER } from '@byd/engine'

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

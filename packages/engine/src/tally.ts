import type { ZoneView } from '@byd/protocol'

// What the rulebook may say about a tagged zone while the game runs (#226, decided 2026-09-20).
//
// The book shows a living number beside a zone it names — `Draghögen ⟨18⟩` — and the number is
// decided here, off the projection, and never off whatever a client happens to hold. That is the
// whole reason this function lives beside `project` rather than in the surface that draws it:
// `project` is the only path from state to wire, and the badge must be a reading of that wire
// rather than a second opinion about the same table.
//
// The count is not a secret. `projectTable` puts every zone in every view, and the one whose
// order a reader may not see goes out as `{ mode: 'count', count }` — deliberately, because at a
// real table anyone can see how thick a pile is. K15 is about the order and the cards. So the
// distinction the book draws is not "may I say a number" but "do I know what the number is made
// of": a filled badge where the book can read the zone, a hollow one where the count is all there
// is to know.
export type ZoneTally = {
  /** How many pieces lie there, as the reader's own projection reports it. */
  count: number
  /** Whether the reader may read the zone itself, or only count it. */
  known: boolean
}

/**
 * The living number for one zone, read out of a reader's own view of the table.
 *
 * It answers for zones and for nothing else, and that is the decision of #226 rather than an
 * omission (open question 3). The only living thing a book could say about a *card* is where it
 * lies, and a card lying in a hidden pile is exactly what K15 exists to protect: a layer that
 * could express it would have to be guarded everywhere it is drawn. A layer that cannot express
 * it needs no guarding at all — so a card reference gets no badge, and reads as the bare name,
 * which is also what a book with no table under it reads as.
 *
 * A zone the view does not carry has no number: a book written against another version of the
 * game names zones this table does not have, and it says the name rather than inventing a nought.
 */
export function zoneTally(view: { zones: readonly ZoneView[] } | null | undefined, id: string): ZoneTally | null {
  const zone = view?.zones.find((z) => z.id === id)
  if (!zone) return null
  return zone.mode === 'order' ? { count: zone.order.length, known: true } : { count: zone.count, known: false }
}

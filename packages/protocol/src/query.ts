import { z } from 'zod'

// A question about the deck's own columns, as a value the document can hold and a line can carry.
//
// The semantics are not new: the editor's data table already decided them (L4). Values chosen in
// the same column are alternatives, columns are conditions — "fälla eller varelse", "och billig".
// What is new is that the question stops being a view the browser keeps and becomes something
// the game says: which cards start in a zone, and which cards an action reaches for.
//
// A clause compares the cell as the designer reads it. A cell is a string, a number, a boolean or
// nothing (L4), and the column's values in the editor are the strings shown in it, so the
// comparison is on `String(cell)` with the ends trimmed — the same reading the table's own chips
// do. Nothing here interprets: no ranges, no negation, no free text. A question that cannot be
// said with chips is not a question this tool asks (B5).
export const QueryClause = z.object({ field: z.string().min(1), is: z.array(z.string()).min(1) })
export type QueryClause = z.infer<typeof QueryClause>

// An empty question asks nothing and is answered by nothing: a zone with no clauses takes no
// cards, and an action that reaches for no cards reaches for none. "Every card" is said by asking
// about nothing at all, which is why it cannot also be what an empty list means.
export const CardQuery = z.array(QueryClause)
export type CardQuery = z.infer<typeof CardQuery>

// A row as a question reads it: the fields the designer typed, by the names they gave them.
export type QueryFields = Readonly<Record<string, unknown>>

const said = (value: unknown): string => (value === null || value === undefined ? '' : String(value).trim())

// Whether a row answers the question. The one place the rule lives, so the editor's preview, the
// table it builds and the engine that reaches into a pile cannot come to different answers.
export function matches(query: CardQuery, fields: QueryFields): boolean {
  if (query.length === 0) return false
  return query.every((clause) => clause.is.includes(said(fields[clause.field])))
}

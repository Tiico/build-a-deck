import type { ProjectRow } from './types.js'
import { cellOf } from './sorting.js'
import { isAssetRef } from './assets.js'

// What a question can be asked about (B5): the deck's own columns, by the names the designer gave
// them, and the values they actually hold.
//
// This is not `discreteColumns` (the table's filter chips) and must not become it. That one asks
// "is this column a vocabulary worth a row of chips", and answers no for a column that holds one
// value per card — which is right for a filter bar above a deck, and wrong here: a designer who
// wants the card called `Drake` to start in a pile of its own is asking about exactly such a
// column. So every column is offered, and the only thing left out is a picture, whose cell value
// is a hash the designer is never shown (E1).
//
// A column with more distinct values than a list can hold is offered as a list of what it holds
// all the same, longest deck and all — the panel scrolls. What it must never do is guess.
export type QueryColumn = { field: string; values: string[] }

export function queryColumns(rows: readonly ProjectRow[], fields: readonly string[]): QueryColumn[] {
  const out: QueryColumn[] = []
  for (const field of fields) {
    const cells = rows.map((row) => cellOf(row, field))
    if (cells.some(isAssetRef)) continue
    const values = [...new Set(cells.map((cell) => String(cell ?? '').trim()).filter((v) => v !== ''))].sort((a, b) => a.localeCompare(b, 'sv'))
    if (values.length > 0) out.push({ field, values })
  }
  return out
}

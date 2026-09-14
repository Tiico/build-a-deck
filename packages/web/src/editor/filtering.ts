import type { ProjectRow } from './types.js'
import { cellOf, columnKind } from './sorting.js'
import { isAssetRef } from './assets.js'
import { translate, type T } from '../i18n/index.js'

// Without a catalogue of its own this module speaks Swedish, exactly as a surface mounted
// without a language provider does: the table hands over its own `t` (A4).
const swedish: T = (key, params) => translate('sv', key, params)

export type FilterState = { query: string; values: Readonly<Record<string, readonly string[]>> }

export const noFilter: FilterState = { query: '', values: {} }

export type DiscreteColumn = { field: string; values: string[] }

// The most values a chip row can carry before it stops being a row of chips.
const MAX_CHIPS = 12

// The columns worth a chip row, in column order. The deck's fields are the designer's own, so
// "the type column" is derived and never a column literally named `typ`: a column is discrete
// when it reads as text (a number is a range — `kostnad 1..10` is a slider's job), when it holds
// at least two different values, and when those values repeat, at most half as many distinct
// values as filled cells. That last test is what separates a vocabulary from free text: `title`
// and `body` hold one value per card, and `id` does so by definition.
//
// A picture is the exception that no counting can catch (#16 on E1): an image column holds
// `asset:<hash>`, the same image sits on many cards, and so it counts exactly like a vocabulary
// and is none — the cell draws a thumbnail and never that string, so a chip of it would be a
// sixty-four-character machine key offered as a word the designer never wrote. One such value is
// enough to say what the column is; a column half drawn and half still described in words is on
// its way to being pictures and is not a vocabulary either.
export function discreteColumns(rows: readonly ProjectRow[], fields: readonly string[]): DiscreteColumn[] {
  const out: DiscreteColumn[] = []
  for (const field of fields) {
    if (columnKind(rows, field) === 'number') continue
    const cells = rows.map((row) => cellOf(row, field))
    if (cells.some(isAssetRef)) continue
    const filled = cells.map((cell) => String(cell ?? '').trim()).filter((value) => value !== '')
    const values = [...new Set(filled)].sort((a, b) => a.localeCompare(b, 'sv'))
    if (values.length < 2 || values.length > MAX_CHIPS || values.length * 2 > filled.length) continue
    out.push({ field, values })
  }
  return out
}

// Filtering is a view of the project (L4), like sorting: it decides what is on screen and never
// touches `doc.rows`. The free-text search reads every column of the row, the card's own id
// included, because the id is a column the designer can see — and for the same reason it does not
// read an image's hash: it is the one value on a row the designer is never shown, so a search for
// `abc` that answered out of a hash would hand back cards with nothing of `abc` anywhere on them.
export function filterRows(
  rows: readonly ProjectRow[],
  fields: readonly string[],
  filter: FilterState,
  pinned: string | null = null,
): ProjectRow[] {
  const terms = filter.query.toLocaleLowerCase('sv').split(/\s+/).filter((term) => term !== '')
  const chosen = Object.entries(filter.values).filter(([, values]) => values.length > 0)
  return rows.filter((row) => {
    // A card just created is empty, so it answers to no search and carries no type. Hiding it
    // would make "Nytt kort" look like a button that does nothing, so it is shown regardless
    // until the designer touches the filter again.
    if (row.id === pinned) return true
    const haystack = fields
      .map((field) => cellOf(row, field))
      .map((cell) => (isAssetRef(cell) ? '' : String(cell ?? '').toLocaleLowerCase('sv')))
      .join(' ')
    if (!terms.every((term) => haystack.includes(term))) return false
    // Chips of the same column are alternatives, chips of different columns are conditions:
    // "fälla or varelse", "and cheap".
    return chosen.every(([field, values]) => values.includes(String(cellOf(row, field) ?? '').trim()))
  })
}

// How much of the deck is on screen. The whole deck is still counted, because a filter hides
// rows and never removes them: "6 av 24 kort" says both what is shown and what is waiting.
export function countLabel(shown: number, total: number, t: T = swedish): string {
  return t('table.count', { shown, total })
}

// A chip is a toggle: pressing it adds its value to the column's alternatives, pressing it again
// takes it away, and a column with no chip pressed does not filter at all.
export function toggleValue(filter: FilterState, field: string, value: string): FilterState {
  const current = filter.values[field] ?? []
  const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
  return { ...filter, values: { ...filter.values, [field]: next } }
}

// Whether the filter is asking anything of the deck at all.
export function isFiltering(filter: FilterState): boolean {
  return filter.query.trim() !== '' || Object.values(filter.values).some((values) => values.length > 0)
}

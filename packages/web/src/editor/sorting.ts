import type { ProjectRow } from './types.js'

export type SortState = { field: string; dir: 'ascending' | 'descending' }

export type ColumnKind = 'number' | 'text'

// The kind of a column is read off its own cells: `antal` holds numbers, an imported column such
// as `kostnad` holds numeric text, and either sorts as numbers. One non-numeric cell makes the
// whole column text, so a column of "3", "4", "varierar" keeps a defined order.
export function columnKind(rows: readonly ProjectRow[], field: string): ColumnKind {
  const values = rows.map((row) => cellOf(row, field)).filter((value) => !isBlank(value))
  return values.length > 0 && values.every(isNumeric) ? 'number' : 'text'
}

// Sorting is a view of the project (L4): it reorders what is shown, never `doc.rows`.
// Rows with an equal cell keep the project's own order, and an empty cell is not a value: it
// stays at the bottom in both directions, so a half-filled column reads as a list of what is done.
export function sortRows(rows: readonly ProjectRow[], sort: SortState | null): ProjectRow[] {
  if (!sort) return [...rows]
  const sign = sort.dir === 'ascending' ? 1 : -1
  const kind = columnKind(rows, sort.field)
  return [...rows].sort((a, b) => {
    const left = cellOf(a, sort.field)
    const right = cellOf(b, sort.field)
    if (isBlank(left) || isBlank(right)) return isBlank(left) === isBlank(right) ? 0 : isBlank(left) ? 1 : -1
    return sign * compare(left, right, kind)
  })
}

// The cycle of variant A: unsorted, ascending, descending, unsorted again.
export function nextSort(sort: SortState | null, field: string): SortState | null {
  if (sort?.field !== field) return { field, dir: 'ascending' }
  return sort.dir === 'ascending' ? { field, dir: 'descending' } : null
}

function cellOf(row: ProjectRow, field: string): unknown {
  return field === 'id' ? row.id : row.fields[field]
}

function compare(a: unknown, b: unknown, kind: ColumnKind): number {
  if (kind === 'number') return Number(a) - Number(b)
  return String(a ?? '').localeCompare(String(b ?? ''), 'sv')
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string' && Number.isFinite(Number(value.trim()))
}

// A row must not slide away under the cursor while it is being typed in (prototype note, L4):
// the order is held to the one that was on screen when the field was entered until it is left.
// Rows the list does not know — added or imported since — follow last, in the project's own order.
export function keepOrder(rows: readonly ProjectRow[], order: readonly string[]): ProjectRow[] {
  const rank = new Map(order.map((id, index) => [id, index]))
  return [...rows].sort((a, b) => (rank.get(a.id) ?? order.length) - (rank.get(b.id) ?? order.length))
}

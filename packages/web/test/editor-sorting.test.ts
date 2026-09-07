import { describe, expect, it } from 'vitest'
import type { ProjectRow } from '@byd/server'
import { sortRows } from '../src/editor/sorting.js'

const rows: ProjectRow[] = [
  { id: 'c', fields: { typ: 'fälla', kostnad: '3' } },
  { id: 'a', fields: { typ: 'fälla', kostnad: '' } },
  { id: 'b', fields: { typ: 'fälla', kostnad: '1' } },
]

const ids = (list: readonly ProjectRow[]) => list.map((row) => row.id)

describe('sortRows', () => {
  it('keeps the project order between equal cells and leaves empty cells last both ways', () => {
    expect(ids(sortRows(rows, { field: 'typ', dir: 'ascending' }))).toEqual(['c', 'a', 'b'])
    expect(ids(sortRows(rows, { field: 'typ', dir: 'descending' }))).toEqual(['c', 'a', 'b'])
    expect(ids(sortRows(rows, { field: 'kostnad', dir: 'ascending' }))).toEqual(['b', 'c', 'a'])
    expect(ids(sortRows(rows, { field: 'kostnad', dir: 'descending' }))).toEqual(['c', 'b', 'a'])
  })
})

import { describe, expect, it } from 'vitest'
import type { ProjectRow } from '@byd/server'
import { countLabel, discreteColumns, filterRows, isFiltering, noFilter, toggleValue } from '../src/editor/filtering.js'

// The deck's fields are the designer's own, so no column is discrete by its name. Here the
// category column is called `fraktion`, the free text `title`, and `kostnad` is a numeric range.
const rows: ProjectRow[] = [
  { id: 'a', fields: { fraktion: 'skogen', kostnad: '1', title: 'Alv', lös: 'ja', tom: '' } },
  { id: 'b', fields: { fraktion: 'berget', kostnad: '2', title: 'Bäver', lös: 'ja', tom: '' } },
  { id: 'c', fields: { fraktion: 'skogen', kostnad: '3', title: 'Ceder', lös: 'ja', tom: '' } },
  { id: 'd', fields: { fraktion: 'berget', kostnad: '4', title: 'Drake', lös: 'ja', tom: '' } },
  { id: 'e', fields: { fraktion: 'skogen', kostnad: '5', title: 'Ek', lös: 'ja', tom: '' } },
  { id: 'f', fields: { fraktion: 'berget', kostnad: '6', title: 'Falk', lös: 'ja', tom: '' } },
]

const columns = ['id', 'fraktion', 'kostnad', 'title', 'lös', 'tom']
const ids = (list: readonly ProjectRow[]) => list.map((row) => row.id)

describe('discreteColumns', () => {
  it('finds the column whose values are a vocabulary, whatever it is called', () => {
    expect(discreteColumns(rows, columns)).toEqual([{ field: 'fraktion', values: ['berget', 'skogen'] }])
  })

  it('leaves out the columns a chip row cannot help with', () => {
    const only = (field: string) => discreteColumns(rows, [field])
    expect(only('id')).toEqual([]) // unique by construction
    expect(only('title')).toEqual([]) // free text: one value per card
    expect(only('kostnad')).toEqual([]) // a number is a range, not a vocabulary
    expect(only('lös')).toEqual([]) // one value only: nothing to choose between
    expect(only('tom')).toEqual([]) // empty: nothing to choose at all
  })

  it('gives up when the vocabulary grows past a chip row', () => {
    const deck = (kinds: number) => Array.from({ length: 26 }, (_, i) => ({ id: `k${i}`, fields: { sort: `s${i % kinds}` } }))
    expect(discreteColumns(deck(13), ['sort'])).toEqual([])
    expect(discreteColumns(deck(12), ['sort']).map((column) => column.values.length)).toEqual([12])
  })
})

describe('filterRows', () => {
  it('lets everything through when nothing is asked', () => {
    expect(ids(filterRows(rows, columns, noFilter))).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(isFiltering(noFilter)).toBe(false)
  })

  it('reads the search across every column at once and does not care about case', () => {
    expect(ids(filterRows(rows, columns, { ...noFilter, query: 'BERGET' }))).toEqual(['b', 'd', 'f'])
    expect(ids(filterRows(rows, columns, { ...noFilter, query: 'drake' }))).toEqual(['d'])
    expect(ids(filterRows(rows, columns, { ...noFilter, query: 'c' }))).toEqual(['c'])
  })

  it('takes several words as several conditions, met anywhere in the row', () => {
    expect(ids(filterRows(rows, columns, { ...noFilter, query: 'skogen ek' }))).toEqual(['e'])
    expect(ids(filterRows(rows, columns, { ...noFilter, query: '  skogen   alv  ' }))).toEqual(['a'])
    expect(ids(filterRows(rows, columns, { ...noFilter, query: 'skogen drake' }))).toEqual([])
  })

  it('combines the search with the chosen values, and keeps the project order', () => {
    expect(ids(filterRows(rows, columns, { ...noFilter, query: 'r' }))).toEqual(['b', 'c', 'd', 'f'])
    const filter = toggleValue({ ...noFilter, query: 'r' }, 'fraktion', 'skogen')
    expect(ids(filterRows(rows, columns, filter))).toEqual(['c'])
    expect(isFiltering(filter)).toBe(true)
    expect(ids(rows)).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
  })

  it('keeps a pinned card whatever is asked, and forgets it once it is not pinned', () => {
    const filter = toggleValue(noFilter, 'fraktion', 'skogen')
    expect(ids(filterRows(rows, columns, filter, 'b'))).toEqual(['a', 'b', 'c', 'e'])
    expect(ids(filterRows(rows, columns, filter, null))).toEqual(['a', 'c', 'e'])
  })
})

describe('toggleValue', () => {
  it('presses a value, adds a second alongside it and lets both go again', () => {
    const one = toggleValue(noFilter, 'fraktion', 'skogen')
    const two = toggleValue(one, 'fraktion', 'berget')
    expect(ids(filterRows(rows, columns, two))).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    const back = toggleValue(toggleValue(two, 'fraktion', 'skogen'), 'fraktion', 'berget')
    expect(isFiltering(back)).toBe(false)
  })
})

describe('countLabel', () => {
  it('counts the shown against the whole deck, never against the filtered deck', () => {
    expect(countLabel(6, 24)).toBe('6 av 24 kort')
    expect(countLabel(0, 8)).toBe('0 av 8 kort')
  })
})

import { describe, expect, it } from 'vitest'
import type { ProjectRow } from '@byd/server'
import { duplicateRows, keepRows, markRows, noSelection, removeRows, selectionLabel, setColumn, toggleRow } from '../src/editor/selection.js'

const rows: ProjectRow[] = [
  { id: 'a', fields: { typ: 'varelse', title: 'Alv', antal: 1 } },
  { id: 'b', fields: { typ: 'fälla', title: 'Bäver', antal: 2 } },
  { id: 'a-kopia', fields: { typ: 'varelse', title: 'Alv igen', antal: 1 } },
]

const ids = (list: readonly ProjectRow[]) => list.map((row) => row.id)
const mark = (...cardRefs: string[]) => markRows(noSelection, cardRefs, true)

describe('toggleRow', () => {
  it('adds a card that was not marked and lets go of one that was', () => {
    const one = toggleRow(noSelection, 'a')
    expect([...one]).toEqual(['a'])
    expect([...toggleRow(one, 'a')]).toEqual([])
  })
})

describe('markRows', () => {
  it('marks or unmarks exactly the cards it is given, leaving the rest of the selection alone', () => {
    const marked = markRows(mark('b'), ['a', 'a-kopia'], true)
    expect([...marked].sort()).toEqual(['a', 'a-kopia', 'b'])
    expect([...markRows(marked, ['a', 'a-kopia'], false)]).toEqual(['b'])
  })
})

describe('keepRows', () => {
  it('keeps only what is still on screen, so a marking never outlives what it can be seen on', () => {
    expect([...keepRows(mark('a', 'b'), ['a', 'a-kopia'])]).toEqual(['a'])
  })
})

describe('selectionLabel', () => {
  it('counts cards in Swedish, one card and many', () => {
    expect(selectionLabel(1)).toBe('1 markerat kort')
    expect(selectionLabel(3)).toBe('3 markerade kort')
  })
})

describe('removeRows', () => {
  it('gives back the whole deck without the marked cards, in the deck order', () => {
    expect(ids(removeRows(rows, mark('a', 'a-kopia')))).toEqual(['b'])
  })

  it('is untroubled by a marking that names a card the deck no longer holds', () => {
    expect(ids(removeRows(rows, mark('borta')))).toEqual(['a', 'b', 'a-kopia'])
  })
})

describe('duplicateRows', () => {
  it('puts each copy right after the card it came from and copies every field', () => {
    const out = duplicateRows(rows, mark('b'))
    expect(ids(out)).toEqual(['a', 'b', 'b-kopia', 'a-kopia'])
    expect(out[2]).toEqual({ id: 'b-kopia', fields: { typ: 'fälla', title: 'Bäver', antal: 2 } })
  })

  it('walks past an id the deck already holds, whoever holds it', () => {
    // `a-kopia` is a card of the deck in its own right here, not a copy of anything.
    expect(ids(duplicateRows(rows, mark('a')))).toEqual(['a', 'a-kopia-2', 'b', 'a-kopia'])
  })

  it('leaves the card it copied untouched', () => {
    const out = duplicateRows(rows, mark('a'))
    expect(out[0]).toBe(rows[0])
    ;(out[1] as ProjectRow).fields['title'] = 'Ändrad'
    expect(rows[0]!.fields['title']).toBe('Alv')
  })
})

describe('setColumn', () => {
  it('writes the column on the marked cards only, and keeps their other fields', () => {
    const out = setColumn(rows, mark('a', 'b'), 'typ', 'plats')
    expect(out.map((row) => row.fields['typ'])).toEqual(['plats', 'plats', 'varelse'])
    expect(out[0]!.fields['title']).toBe('Alv')
  })

  it('writes a number when the column is the system column antal (L4)', () => {
    expect(setColumn(rows, mark('a'), 'antal', 4)[0]!.fields['antal']).toBe(4)
  })
})

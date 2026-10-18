import { describe, expect, it } from 'vitest'
import type { PlaytestTable, PlaytestVersion } from '@byd/server/doc'
import { chosenVersion, compareWith, decimal, meanOf, rowSummary, silent, tablesFor } from '../src/editor/playtestReading.js'
import { translate, type Lang, type T } from '../src/i18n/index.js'

// What the Resultat view and the ended table's row say (#1010, beställarens val 2026-10-18), as
// data: which version opens, which one it is held against, what a row's one line says, who did
// not answer. Nothing here draws.

const t = (lang: Lang): T => (key, params) => translate(lang, key, params)
const sv = t('sv')
const en = t('en')

const counts = (fun: number[], clarity = [0, 0, 0, 0, 0], balance = [0, 0, 0, 0, 0]) => ({ fun, clarity, balance })
const version = (over: Partial<PlaytestVersion> & { version: string }): PlaytestVersion => ({ ended: 0, running: 0, players: 0, answered: 0, observers: 0, flags: 0, distribution: counts([0, 0, 0, 0, 0]), ...over })
const table = (over: Partial<PlaytestTable> = {}): PlaytestTable => ({ id: 't1', code: 'ABC234', version: 'rev-2', ended: true, endedAt: '2026-10-18T10:09:00.000Z', moves: 14, people: [], answers: [], flags: [], ...over })
const said = (who: string, seat: string | null) => ({ who, seat, observer: seat === null, at: '2026-10-18T10:10:00.000Z', answers: { fun: 4, clarity: 3, balance: 5, change: '' } })
const flag = (version: string) => ({ who: 'Ada', seat: 'A', observer: false, note: '', at: '2026-10-18T10:05:00.000Z', move: 3, version })

describe('which version the Resultat view opens on, and what it is held against', () => {
  const versions = [version({ version: 'rev-6', running: 1 }), version({ version: 'rev-5', ended: 2, answered: 4 }), version({ version: 'rev-4', ended: 1 }), version({ version: 'rev-3', ended: 2, answered: 3 })]

  it('opens on the newest version a table has ended on, and on nothing when no table has ended', () => {
    expect(chosenVersion(versions, null)).toBe('rev-5')
    expect(chosenVersion(versions, 'rev-3')).toBe('rev-3')
    expect(chosenVersion([version({ version: 'rev-1', running: 1 })], null)).toBeNull()
  })

  // «Mot förra testade versionen» (beställarens val): the one before it that has answers to be
  // held against, since a version whose tables nobody answered at has no distribution to show.
  it('holds a version against the newest older one that was answered', () => {
    expect(compareWith(versions, 'rev-5')?.version).toBe('rev-3')
    expect(compareWith(versions, 'rev-3')).toBeNull()
  })
})

describe('the numbers', () => {
  it('takes the mean of a distribution, and has none for no answers', () => {
    expect(meanOf([0, 0, 1, 4, 1])).toBeCloseTo(4)
    expect(meanOf([0, 0, 0, 0, 0])).toBeNull()
  })

  it('writes a decimal the reader’s way', () => {
    expect(decimal(4.25, 'sv')).toBe('4,3')
    expect(decimal(4.25, 'en')).toBe('4.3')
    expect(decimal(null, 'sv')).toBe('–')
  })
})

describe('an ended table’s one line (A:s rad)', () => {
  it('says how many answered and how many flags, in both languages', () => {
    const answered = table({ answers: [said('Ada', 'A'), said('Bo', 'B'), said('Cilla', null)], flags: [flag('rev-2'), flag('rev-2')] })
    expect(rowSummary(answered, sv)).toBe('3 svar · 2 flaggor')
    expect(rowSummary(answered, en)).toBe('3 answers · 2 flags')
    expect(rowSummary(table({ answers: [said('Ada', 'A')], flags: [flag('rev-2')] }), sv)).toBe('1 svar · 1 flagga')
    expect(rowSummary(table(), sv)).toBe('Inga svar · inga flaggor')
    expect(rowSummary(table(), en)).toBe('No answers · no flags')
  })
})

describe('who did not answer', () => {
  it('names the players and observers who were there and left no answer', () => {
    const at = table({
      people: [
        { name: 'Ada', seat: 'A', observer: false },
        { name: 'Bo', seat: 'B', observer: false },
        { name: 'Cilla', seat: null, observer: true },
        { name: 'Dan', seat: null, observer: true },
      ],
      answers: [said('Ada', 'A'), said('Cilla', null)],
    })
    expect(silent(at).map((p) => p.name)).toEqual(['Bo', 'Dan'])
  })
})

describe('which tables a version is read from', () => {
  it('is the tables that ended on it and those that flagged it before an update', () => {
    const tables = [table({ id: 'a', version: 'rev-5' }), table({ id: 'b', version: 'rev-5', ended: false }), table({ id: 'c', version: 'rev-5', flags: [flag('rev-4')] }), table({ id: 'd', version: 'rev-3' })]
    expect(tablesFor(tables, 'rev-5').map((x) => x.id)).toEqual(['a', 'c'])
    expect(tablesFor(tables, 'rev-4').map((x) => x.id)).toEqual(['c'])
  })
})

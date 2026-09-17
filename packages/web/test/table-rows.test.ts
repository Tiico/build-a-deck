import { describe, expect, it } from 'vitest'
import type { TableSummary } from '../src/editor/ProjectClient.js'
import { tableGroups } from '../src/editor/tableRows.js'
import { translate, type Lang, type T } from '../src/i18n/index.js'

// Which group a table belongs in, and what that group is called (#176, C9, G3). The list of
// tables used to be one flat stack, and at any real number of tables the one table being played
// lay a screen below four that nobody had ever touched. So the column is three groups, and this
// module is the whole of that decision as data: the panel paints what comes out of here.

const t = (lang: Lang): T => (key, params) => translate(lang, key, params)
const sv = t('sv')

const table = (over: Partial<TableSummary> = {}): TableSummary => ({ id: 'a1b2c3d4-0000', version: 'rev-1', ended: false, lastAt: null, ...over })

describe('which group a table belongs in (#176)', () => {
  it('tells a table that has been played from one that was started and never touched, and from one that is over', () => {
    const played = table({ id: 'spelas', lastAt: '2026-09-17T06:26:00.000Z' })
    const untouched = table({ id: 'orört' })
    // An ending writes `session.end` into the log, so an ended table has a moment too — being
    // over is what decides it, never the absence of a last move.
    const ended = table({ id: 'avslutat', ended: true, lastAt: '2026-09-17T06:30:00.000Z' })

    expect(tableGroups([untouched, ended, played], sv).map((g) => [g.id, g.tables.map((x) => x.id)])).toEqual([
      ['played', ['spelas']],
      ['untouched', ['orört']],
      ['ended', ['avslutat']],
    ])
  })

  it('says in its heading how many are behind each fold, and draws no group for a state the game has none of', () => {
    const groups = tableGroups([table({ id: 'ett' }), table({ id: 'två' }), table({ id: 'tre' })], sv)
    expect(groups.map((g) => g.heading)).toEqual(['Startade, aldrig spelade · 3'])
  })

  it('keeps the order the server answered in inside a group: the newest table is the newest table', () => {
    const tables = [table({ id: 'ny', lastAt: '2026-09-17T06:30:00.000Z' }), table({ id: 'gammal', lastAt: '2026-09-16T06:30:00.000Z' })]
    expect(tableGroups(tables, sv)[0]!.tables.map((x) => x.id)).toEqual(['ny', 'gammal'])
  })
})

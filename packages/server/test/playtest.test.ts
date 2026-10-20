import { describe, expect, it } from 'vitest'
import { SCHEMA_VERSION, type Applied, type Intent } from '@byd/protocol'
import { playtestOf, type PlaytestSource } from '../src/playtest.js'
import type { SurveyRecord } from '../src/surveys.js'
import type { GuestRecord } from '../src/store.js'
import { twoSeatSetup } from './fixture.js'

// What the designer reads after a playtest (#1010, G3): per table its answers, its flags and who
// was there; per version how many answered and how the answers fall. All of it is read off what
// the server keeps — the log, the surveys and the admissions — and nothing is the client's to work
// out: the names come from `seat.claim` and the admissions, and a move is the engine's own.

let clock = 0
const at = () => new Date(Date.UTC(2026, 9, 18, 12, 0, clock++)).toISOString()
const logOf = (...lines: [string | null, Intent][]): Applied[] =>
  lines.map(([by, intent], i) => ({ schemaVersion: SCHEMA_VERSION, seq: i + 1, batch: `b${i + 1}`, at: at(), by, intent }))
const answer = (who: string, seat: string | null, fun: number, clarity: number, balance: number, change = ''): SurveyRecord => ({
  sessionId: 'x',
  version: 'rev-2',
  at: at(),
  who,
  seat,
  ...(seat === null ? { observer: true } : {}),
  answers: { fun, clarity, balance, change },
})
const watcher = (name: string): GuestRecord => ({ tokenHash: name, kind: 'observer', seat: null, name, issuedAt: at(), expiresAt: at() })
const table = (id: string, version: string, log: Applied[], surveys: SurveyRecord[] = [], admissions: GuestRecord[] = [], code = id.toUpperCase()): PlaytestSource => ({
  id,
  session: { id, version, setup: twoSeatSetup(), code },
  log,
  surveys,
  admissions,
})
const draw = (seat: string): [string, Intent] => [seat, { v: 'draw', from: 'draw', to: `hand:${seat}`, count: 1 }]

describe('a table’s playtest', () => {
  it('says who sat and watched, what each answered, and every flag with its name, move and version', () => {
    const log = logOf(
      [null, { v: 'seat.claim', seat: 'A', name: 'Ada' }],
      [null, { v: 'seat.claim', seat: 'B', name: 'Bo' }],
      draw('A'),
      draw('B'),
      ['A', { v: 'flag', note: 'Draken är för stark' }],
      draw('A'),
      [null, { v: 'flag', observer: 'Cilla' }],
      [null, { v: 'session.end' }],
    )
    const ended = log.at(-1)!.at
    const [read] = playtestOf([table('t1', 'rev-2', log, [answer('Ada', 'A', 4, 3, 2, 'Kortare'), answer('Cilla', null, 5, 5, 5)], [watcher('Cilla'), watcher('Dan')], 'ABC234')]).tables
    expect(read).toEqual({
      id: 't1',
      code: 'ABC234',
      version: 'rev-2',
      ended: true,
      endedAt: ended,
      moves: 3,
      people: [
        { name: 'Ada', seat: 'A', observer: false },
        { name: 'Bo', seat: 'B', observer: false },
        { name: 'Cilla', seat: null, observer: true },
        { name: 'Dan', seat: null, observer: true },
      ],
      answers: [
        { who: 'Ada', seat: 'A', observer: false, at: expect.any(String), answers: { fun: 4, clarity: 3, balance: 2, change: 'Kortare' } },
        { who: 'Cilla', seat: null, observer: true, at: expect.any(String), answers: { fun: 5, clarity: 5, balance: 5, change: '' } },
      ],
      flags: [
        { who: 'Ada', seat: 'A', observer: false, note: 'Draken är för stark', at: log[4]!.at, move: 2, version: 'rev-2' },
        { who: 'Cilla', seat: null, observer: true, note: '', at: log[6]!.at, move: 3, version: 'rev-2' },
      ],
    })
  })

  it('names a flag by the name its seat sat under when it was raised, and the table’s own as nobody’s', () => {
    const [read] = playtestOf([
      table(
        't1',
        'rev-1',
        logOf(
          [null, { v: 'seat.claim', seat: 'A', name: 'Ada' }],
          ['A', { v: 'flag' }],
          [null, { v: 'seat.release', seat: 'A' }],
          [null, { v: 'seat.claim', seat: 'A', name: 'Eva' }],
          ['A', { v: 'flag' }],
          [null, { v: 'flag', note: 'bordet' }],
        ),
      ),
    ]).tables
    expect(read!.flags.map((f) => [f.who, f.seat, f.observer])).toEqual([
      ['Ada', 'A', false],
      ['Eva', 'A', false],
      [null, null, false],
    ])
    expect(read!.ended).toBe(false)
  })
})

describe('a version’s playtest', () => {
  it('sums the tables that ended on it, leaves the observers out of the distribution, and counts a running table apart', () => {
    const seated = (...names: [string, string][]): [string | null, Intent][] => names.map(([seat, name]) => [null, { v: 'seat.claim', seat, name }])
    const end: [null, Intent] = [null, { v: 'session.end' }]
    const read = playtestOf([
      table('t3', 'rev-2', logOf(...seated(['A', 'Eva']), draw('A'))),
      table('t2', 'rev-2', logOf(...seated(['A', 'Ada'], ['B', 'Bo']), draw('A'), end), [answer('Ada', 'A', 4, 3, 2), answer('Bo', 'B', 4, 5, 2), answer('Cilla', null, 1, 1, 1)]),
      table('t1', 'rev-1', logOf(...seated(['A', 'Ada'], ['B', 'Bo']), draw('A'), end), [answer('Bo', 'B', 2, 2, 2)]),
    ])
    expect(read.versions).toEqual([
      { version: 'rev-2', ended: 1, running: 1, players: 2, answered: 2, observers: 1, flags: 0, distribution: { fun: [0, 0, 0, 2, 0], clarity: [0, 0, 1, 0, 1], balance: [0, 2, 0, 0, 0] } },
      { version: 'rev-1', ended: 1, running: 0, players: 2, answered: 1, observers: 0, flags: 0, distribution: { fun: [0, 1, 0, 0, 0], clarity: [0, 1, 0, 0, 0], balance: [0, 1, 0, 0, 0] } },
    ])
  })

  // A table refreshed mid-game (C7) is played on two versions: what was flagged before the update
  // was said about the version it was raised on, and the survey about the one the table ended on.
  it('files a flag under the version it was raised on, and the table under the one it ended on', () => {
    const read = playtestOf([
      table(
        't1',
        'rev-1',
        logOf(
          [null, { v: 'seat.claim', seat: 'A', name: 'Ada' }],
          draw('A'),
          ['A', { v: 'flag', note: 'före' }],
          [null, { v: 'version.change', to: 'rev-2', components: [] }],
          draw('A'),
          ['A', { v: 'flag', note: 'efter' }],
          [null, { v: 'session.end' }],
        ),
        [answer('Ada', 'A', 3, 3, 3)],
      ),
    ])
    expect(read.tables[0]).toMatchObject({ version: 'rev-2', flags: [{ note: 'före', version: 'rev-1', move: 1 }, { note: 'efter', version: 'rev-2', move: 2 }] })
    expect(read.versions.map((v) => [v.version, v.ended, v.answered, v.flags])).toEqual([
      ['rev-2', 1, 1, 1],
      ['rev-1', 0, 0, 1],
    ])
  })
})

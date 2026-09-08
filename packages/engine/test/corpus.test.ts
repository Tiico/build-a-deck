import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TypeRegistry, initialState, liftLog, project, replay, STANDARD_TYPES } from '../src/index.js'
import { anonymise, record, type CorpusEntry } from '../scripts/corpus.js'
import { Harness } from './fixture.js'

// The replay corpus (DRIFT §7): real logs that must replay identically, and project identically
// for every viewer, on every commit. This is the gate; there is no staging.
const dir = join(import.meta.dirname, '../../../corpus')
const registry = new TypeRegistry(STANDARD_TYPES)
const files = readdirSync(dir).filter((f) => f.endsWith('.json'))

describe('the replay corpus', () => {
  it('has entries', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    it(`${file}: every line still lifts to today's schema, replays, and projects as it did when recorded`, () => {
      const entry = JSON.parse(readFileSync(join(dir, file), 'utf8')) as CorpusEntry
      // Lifted, never rewritten (DRIFT §7): the files stay as they were recorded.
      const log = liftLog(entry.log)
      const initial = initialState(entry.version, entry.setup, registry)
      const state = replay(initial, registry, log)
      const history = { stateAt: (seq: number) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log }
      for (const [viewer, expected] of Object.entries(entry.expected)) {
        const seat = viewer === 'table' ? null : viewer === 'observer' ? null : viewer
        expect(project(state, registry, seat, undefined, history, viewer === 'observer')).toEqual(expected)
      }
    })
  }
})

describe('recording an entry', () => {
  it('anonymises who sat down, what was flagged and who watched, and keeps the play itself', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Nicklas Ö' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'flag', note: 'privat kommentar' })
    h.do(null, { v: 'flag', observer: 'Eva Riktig', note: 'mer privat' })
    const log = anonymise(h.log)
    expect(log[0]?.intent).toEqual({ v: 'seat.claim', seat: 'A', name: 'Spelare 1' })
    expect(log[1]?.intent).toEqual({ v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(log[2]?.intent).toEqual({ v: 'flag', note: '(kommentar)' })
    expect(log[3]?.intent).toEqual({ v: 'flag', observer: 'Observatör', note: '(kommentar)' })
    const entry = record('test', 'v1', h.state.setup, h.log, registry)
    expect(Object.keys(entry.expected).sort()).toEqual(['A', 'B', 'observer', 'table'])
    expect(entry.expected['A']?.seats.find((s) => s.id === 'A')?.name).toBe('Spelare 1')
  })
})

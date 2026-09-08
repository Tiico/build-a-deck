import { describe, expect, it } from 'vitest'
import { Applied, SCHEMA_VERSION } from '@byd/protocol'
import { liftLine } from '../src/index.js'
import { Harness } from './fixture.js'

// The event schema is never migrated on disk (DRIFT §7): every line carries the schema version
// it was written under, and the engine lifts older lines to today's shape when it reads them.
// Lines from before versioning have no field at all: they are version 0.
describe('schema versions', () => {
  it('every line the engine decides carries the current schema version', () => {
    const h = new Harness()
    const line = h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    expect(line.schemaVersion).toBe(SCHEMA_VERSION)
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(1)
    expect(() => Applied.parse({ seq: 1, batch: 'b', at: '2026-09-07T00:00:00.000Z', by: null, intent: { v: 'flag' } })).toThrow()
  })

  it('lifts a line from before versioning to today, leaves a current line as it is, and refuses one from the future', () => {
    const legacy = { seq: 1, batch: 'b', at: '2026-09-07T00:00:00.000Z', by: null, intent: { v: 'flag', note: 'gammal rad' } }
    const lifted = liftLine(legacy)
    expect(lifted).toEqual({ ...legacy, schemaVersion: SCHEMA_VERSION })
    expect(Applied.parse(lifted)).toEqual(lifted)

    const current = { ...legacy, schemaVersion: SCHEMA_VERSION }
    expect(liftLine(current)).toEqual(current)

    expect(() => liftLine({ ...legacy, schemaVersion: SCHEMA_VERSION + 1 })).toThrow(/schema version/)
    expect(() => liftLine({ seq: 'x' })).toThrow()
  })

  it('a log from before versioning replays exactly as it did once lifted', () => {
    const h = new Harness(3)
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const legacy = h.log.map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'schemaVersion')))
    const lifted = legacy.map(liftLine)
    expect(lifted).toEqual(h.log)
  })
})

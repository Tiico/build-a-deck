import { describe, expect, it } from 'vitest'
import { replayExport } from '../scripts/replay-check.js'
import { Harness } from './fixture.js'

// The restore rehearsal's last step (DRIFT §5): a session's log, as the database gives it back,
// must replay through the engine to the state it had. A line without an outcome comes back
// without the key, and a line by the table without `by`, since JSON nulls were stripped.
describe('replay check', () => {
  it('replays an exported log to its final seq and reports it', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const log = h.log.map((l) => {
      const { by, outcome, ...rest } = l
      return { ...rest, ...(by === null ? {} : { by }), ...(outcome === undefined ? {} : { outcome }) }
    })
    const report = replayExport({ msg: 'export', session: { id: 's', version: 'v1', setup: h.initial.setup, log } })
    expect(report).toEqual({ msg: 'replayed', session: 's', lines: 3, seq: 3, components: 10 })
  })

  it('refuses a log that does not replay', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const broken = [{ ...h.log[0]!, seq: 5 }]
    expect(() => replayExport({ session: { id: 's', version: 'v1', setup: h.initial.setup, log: broken } })).toThrow(/seq gap/)
  })
})

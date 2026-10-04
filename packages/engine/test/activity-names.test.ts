import { describe, expect, it } from 'vitest'
import { activityOf } from '../src/index.js'
import { Harness } from './fixture.js'

// Who made a move is said by the name they sat under when they made it (#714). The line used to be
// written with the seat's name as it is now, so when Di left, her rows turned into «D drog …» while
// «Di satte sig på plats D» still stood above them: the history changed its names mid-round.
describe('the names a log is told in (#714)', () => {
  it('keeps the name a seat had when it moved, after it has left and after another has sat down', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Di' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'seat.release', seat: 'A' })
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Eva' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const told = activityOf(h.log)
    expect(told.map((l) => [l.intent.v, l.name])).toEqual([
      ['seat.claim', undefined],
      ['draw', 'Di'],
      ['seat.release', 'Di'],
      ['seat.claim', undefined],
      ['draw', 'Eva'],
    ])
  })

  it('tells only the tail it is asked for, by the names the whole log gave it', () => {
    const h = new Harness()
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Di' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'seat.release', seat: 'A' })
    const told = activityOf(h.log, 1)
    expect(told).toHaveLength(1)
    expect(told[0]).toMatchObject({ intent: { v: 'seat.release' }, name: 'Di' })
    // And never the outcome, which the projection keeps from every view.
    expect(told[0]).not.toHaveProperty('outcome')
  })
})

import { describe, expect, it } from 'vitest'
import { Applied, type Snapshot } from '@byd/protocol'
import { Harness, SEATS, registry } from './fixture.js'
import { apply, project, replay } from '../src/index.js'

function playScript(h: Harness): Snapshot[][] {
  const views: Snapshot[][] = []
  const snap = () => views.push(SEATS.map((s) => h.view(s)))
  snap()
  const steps: (() => void)[] = [
    () => h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' }),
    () => h.do(null, { v: 'seat.claim', seat: 'B', name: 'Bo' }),
    () => h.do(null, { v: 'shuffle', pile: 'draw' }),
    () => h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 }),
    () => h.do('A', { v: 'move', component: h.top('hand:A'), to: 'table', x: 100, y: 40, rot: 90 }),
    () => h.do('A', { v: 'flip', component: h.top('table'), face: 'front' }),
    () => h.do('B', { v: 'peek', components: [h.top('hand:B')] }),
    () => h.do('B', { v: 'showTo', components: [h.top('hand:B')], seats: ['A'] }),
    () => h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 }),
    () => h.do(null, { v: 'split', pile: 'draw', at: 2, to: 'discard' }),
    () => h.do('A', { v: 'stack', component: h.top('hand:A'), onto: h.top('discard') }),
    () => h.do('A', { v: 'seat.release', seat: 'A' }),
    () => h.do(null, { v: 'setup.reset' }),
    () => h.do(null, { v: 'shuffle', pile: 'draw' }),
    () => h.do(null, { v: 'session.end' }),
  ]
  for (const step of steps) {
    step()
    snap()
  }
  return views
}

describe('deterministic replay', () => {
  it('folding the log reproduces the live state bit for bit', () => {
    const h = new Harness(42)
    playScript(h)
    const replayed = replay(h.initial, registry, h.log)
    expect(replayed).toEqual(h.state)
  })

  it('reproduces every seat\'s view at every step', () => {
    const h = new Harness(42)
    const live = playScript(h)

    let state = h.initial
    const replayedViews: Snapshot[][] = [SEATS.map((s) => project(state, registry, s))]
    for (const line of h.log) {
      state = apply(state, registry, line)
      replayedViews.push(SEATS.map((s) => project(state, registry, s)))
    }
    expect(replayedViews).toEqual(live)
  })

  it('every log line survives a JSON round trip through the protocol schema', () => {
    const h = new Harness(42)
    playScript(h)
    for (const line of h.log) {
      const parsed = Applied.parse(JSON.parse(JSON.stringify(line)))
      expect(parsed).toEqual(line)
    }
  })

  it('different seeds give different games that each replay exactly', () => {
    const a = new Harness(1)
    const b = new Harness(2)
    playScript(a)
    playScript(b)
    expect(a.state).not.toEqual(b.state)
    expect(replay(a.initial, registry, a.log)).toEqual(a.state)
    expect(replay(b.initial, registry, b.log)).toEqual(b.state)
  })

  it('rejects a log with a gap in seq', () => {
    const h = new Harness()
    h.do(null, { v: 'shuffle', pile: 'draw' })
    const line = h.log[0]!
    expect(() => apply(h.initial, registry, { ...line, seq: 5 })).toThrow(/seq gap/)
  })
})

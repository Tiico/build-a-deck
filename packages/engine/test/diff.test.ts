import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@byd/protocol'
import { Harness, SEATS } from './fixture.js'
import { applyPatch, diff } from '../src/index.js'

describe('per-seat patches', () => {
  it('applyPatch(prev, diff(prev, next)) equals next for every seat at every step', () => {
    const h = new Harness(9)
    const steps: (() => void)[] = [
      () => h.do(null, { v: 'shuffle', pile: 'draw' }),
      () => h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 }),
      () => h.do('A', { v: 'move', component: h.top('hand:A'), to: 'table', x: 1 }),
      () => h.do('A', { v: 'flip', component: h.top('table'), face: 'front' }),
      () => h.do('B', { v: 'showTo', components: [h.top('hand:B')], seats: ['A'] }),
      () => h.do(null, { v: 'move', component: h.top('table'), to: 'discard' }),
      () => h.do('B', { v: 'move', component: h.top('hand:B'), to: 'draw' }),
      () => h.do(null, { v: 'shuffle', pile: 'draw' }),
      () => h.do(null, { v: 'setup.reset' }),
    ]
    const prev = new Map<string | null, Snapshot>(SEATS.map((s) => [s, h.view(s)]))
    for (const step of steps) {
      step()
      for (const seat of SEATS) {
        const next = h.view(seat)
        const patched = applyPatch(prev.get(seat)!, diff(prev.get(seat)!, next))
        expect(patched).toEqual(next)
        prev.set(seat, next)
      }
    }
  })

  it('a patch to B after A draws carries no component from A\'s hand', () => {
    const h = new Harness()
    const before = h.view('B')
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    const patch = diff(before, h.view('B'))
    const upserts = patch.ops.filter((op) => op.op === 'upsert')
    expect(upserts).toHaveLength(0)
    expect(patch.ops).toEqual(
      expect.arrayContaining([
        { op: 'zone', view: expect.objectContaining({ id: 'draw', mode: 'count', count: 7 }) },
        { op: 'zone', view: expect.objectContaining({ id: 'hand:A', mode: 'count', count: 3 }) },
      ]),
    )
  })

  it('refuses to diff snapshots for different seats', () => {
    const h = new Harness()
    expect(() => diff(h.view('A'), h.view('B'))).toThrow(/different seats/)
  })
})

import { describe, expect, it } from 'vitest'
import { Harness, inZone } from './fixture.js'

describe('atomic envelopes (K3)', () => {
  it('applies several intents with consecutive seq and a shared batch id', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 3 })
    const ids = [...h.zone('table')]
    const lines = h.batch(
      null,
      { v: 'move', component: ids[0]!, to: 'discard' },
      { v: 'move', component: ids[1]!, to: 'discard' },
      { v: 'move', component: ids[2]!, to: 'discard' },
    )
    expect(lines.map((l) => l.seq)).toEqual([2, 3, 4])
    expect(new Set(lines.map((l) => l.batch)).size).toBe(1)
    expect(h.zone('discard')).toEqual([ids[2], ids[1], ids[0]])
    expect(h.state.seq).toBe(4)
  })

  it('rejects the whole envelope when a later intent is invalid, leaving state and seq untouched', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
    const [a, b] = h.zone('table') as [string, string]
    const before = h.state
    const d = h.try(
      null,
      { v: 'move', component: a, to: 'discard' },
      { v: 'move', component: 'nope', to: 'discard' },
      { v: 'move', component: b, to: 'discard' },
    )
    expect(d).toMatchObject({ ok: false, reason: 'intent 1: unknown component nope' })
    expect(h.state).toBe(before)
    expect(h.log).toHaveLength(1)
  })

  it('validates later intents against the working state of earlier ones', () => {
    const h = new Harness()
    // Draw three, then draw the same three again from a pile that no longer has them.
    const d = h.try(
      null,
      { v: 'draw', from: 'draw', to: 'table', count: 9 },
      { v: 'draw', from: 'draw', to: 'table', count: 2 },
    )
    expect(d).toMatchObject({ ok: false, reason: /intent 1: zone draw has fewer than 2/ })

    const ok = h.try(
      null,
      { v: 'draw', from: 'draw', to: 'table', count: 9 },
      { v: 'draw', from: 'draw', to: 'table', count: 1 },
    )
    expect(ok.ok).toBe(true)
  })

  it('decides random outcomes in order within a batch and replays identically', () => {
    const h = new Harness(11)
    const lines = h.batch(null, { v: 'shuffle', pile: 'draw' }, { v: 'shuffle', pile: 'draw' })
    expect(lines[0]!.outcome?.kind).toBe('shuffle')
    expect(lines[1]!.outcome?.kind).toBe('shuffle')
    if (lines[0]!.outcome?.kind !== 'shuffle' || lines[1]!.outcome?.kind !== 'shuffle') throw new Error('unreachable')
    // The second shuffle re-keys the ids the first one produced.
    const firstFresh = new Set(lines[0]!.outcome.order)
    expect(lines[1]!.outcome.rekey.every(([old]) => firstFresh.has(old))).toBe(true)
    expect(h.zone('draw')).toEqual(lines[1]!.outcome.order)
  })

  it('a stack that forms a pile inside a batch is visible to the next intent in the same batch', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
    const [a, b] = h.zone('table') as [string, string]
    const lines = h.batch(null, { v: 'stack', component: a, onto: b }, { v: 'shuffle', pile: `z${h.state.seq + 1}` })
    expect(lines).toHaveLength(2)
    expect(h.piles()).toHaveLength(1)
    expect(inZone(h.view(null), h.piles()[0]!)).toHaveLength(2)
  })
})

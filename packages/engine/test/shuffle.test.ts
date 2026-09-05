import { describe, expect, it } from 'vitest'
import { CARDS, Harness, inZone, zoneView } from './fixture.js'

describe('shuffle', () => {
  it('re-keys every component so a card cannot be tracked through the shuffle', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const known = h.top('hand:A')
    expect(h.state.components[known]!.cardRef).toBe('dragon')

    h.do('A', { v: 'move', component: known, to: 'draw' })
    h.do(null, { v: 'shuffle', pile: 'draw' })

    expect(h.state.components[known]).toBeUndefined()
    expect(h.zone('draw').every((id) => id.startsWith('r'))).toBe(true)
    expect(h.zone('draw').map((id) => h.state.components[id]!.cardRef).sort()).toEqual([...CARDS].sort())
  })

  it('changes the order and records it as a result, not a seed', () => {
    const h = new Harness(3)
    const before = h.zone('draw').map((id) => h.state.components[id]!.cardRef)
    const applied = h.do(null, { v: 'shuffle', pile: 'draw' })
    const after = h.zone('draw').map((id) => h.state.components[id]!.cardRef)

    expect(after).not.toEqual(before)
    expect(applied.outcome).toMatchObject({ kind: 'shuffle' })
    if (applied.outcome?.kind !== 'shuffle') throw new Error('unreachable')
    expect(applied.outcome.order).toEqual(h.zone('draw'))
    expect(applied.outcome.rekey).toHaveLength(10)
  })

  it('clears every override on the shuffled components', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const id = h.top('table')
    h.do('B', { v: 'peek', components: [id] })
    h.do(null, { v: 'move', component: id, to: 'discard' })
    h.do(null, { v: 'shuffle', pile: 'discard' })

    const only = h.zone('discard')[0]!
    expect(h.state.components[only]!.peekedBy).toEqual([])
    expect(inZone(h.view('B'), 'discard')[0]!.cardRef).toBeNull()
  })

  it('the table connection may shuffle and draw, as on a shared screen', () => {
    const h = new Harness()
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do(null, { v: 'draw', from: 'draw', to: 'hand:B', count: 2 })
    expect(zoneView(h.view('B'), 'hand:B')).toMatchObject({ mode: 'order' })
    expect(inZone(h.view('B'), 'hand:B')).toHaveLength(2)
  })
})

describe('deal', () => {
  it('deals round-robin from the top and logs one line', () => {
    const h = new Harness()
    const applied = h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 2 })
    expect(applied.intent.v).toBe('deal')
    expect(h.log).toHaveLength(1)
    expect(zoneView(h.view(null), 'draw')).toMatchObject({ count: 6 })
    expect(inZone(h.view('A'), 'hand:A').map((c) => c.cardRef)).toEqual(['wizard', 'dragon'])
    expect(inZone(h.view('B'), 'hand:B').map((c) => c.cardRef)).toEqual(['rogue', 'knight'])
  })
})

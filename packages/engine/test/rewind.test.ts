import { describe, expect, it } from 'vitest'
import { replay } from '../src/index.js'
import { Harness, registry } from './fixture.js'

describe('undo.self (B): a seat takes back its own last act', () => {
  it('restores the table to before the last batch, as a new log line that replays', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const before = h.view('A')
    h.batch('A', { v: 'move', component: h.top('hand:A'), to: 'table', x: 10, y: 20 }, { v: 'rotate', component: h.top('hand:A'), rot: 90 })
    expect(h.zone('hand:A')).toHaveLength(1)

    const line = h.do('A', { v: 'undo.self' })
    expect(line.outcome?.kind).toBe('restore')
    expect(h.zone('hand:A')).toHaveLength(2)
    expect(h.view('A')).toEqual({ ...before, seq: line.seq })
    expect(replay(h.initial, registry, h.log)).toEqual(h.state)
  })
})

describe('undo.self is only for the uncontested', () => {
  it('is refused once another seat has acted, and points to a rewind proposal', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    const d = h.try('A', { v: 'undo.self' })
    expect(d).toMatchObject({ ok: false, reason: expect.stringMatching(/propose a rewind/) })
    // B, who acted last, may still take theirs back.
    expect(h.try('B', { v: 'undo.self' }).ok).toBe(true)
  })

  it('has nothing to undo before the seat has acted, and cannot share an envelope', () => {
    const h = new Harness()
    expect(h.try('A', { v: 'undo.self' })).toMatchObject({ ok: false, reason: 'nothing to undo' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(h.try('A', { v: 'undo.self' }, { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }).ok).toBe(false)
  })

  it('undoing twice goes further back, not forward again', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'undo.self' })
    expect(h.zone('hand:A')).toHaveLength(2)
    h.do('A', { v: 'undo.self' })
    expect(h.zone('hand:A')).toHaveLength(1)
    h.do('A', { v: 'undo.self' })
    expect(h.zone('hand:A')).toHaveLength(0)
    expect(h.try('A', { v: 'undo.self' })).toMatchObject({ ok: false, reason: 'nothing to undo' })
  })
})

describe('a rewind reshuffles what was seen', () => {
  it('reshuffles a hidden pile that lost a card, and leaves untouched piles alone', () => {
    const h = new Harness()
    h.do(null, { v: 'shuffle', pile: 'draw' })
    const drawBefore = [...h.zone('draw')]
    const refsBefore = drawBefore.map((id) => h.state.components[id]!.cardRef).sort()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const seen = h.top('hand:A')
    h.do('A', { v: 'undo.self' })
    // The card is back in the pile, but nobody can say where: every id is fresh.
    expect(h.zone('draw')).toHaveLength(drawBefore.length)
    expect(h.zone('draw')).not.toContain(seen)
    expect(h.zone('draw').some((id) => drawBefore.includes(id))).toBe(false)
    expect(h.zone('draw').map((id) => h.state.components[id]!.cardRef).sort()).toEqual(refsBefore)

    // A public pile keeps its order and ids: there was nothing to hide.
    h.do(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
    const discard = [...h.zone('discard')]
    h.do('B', { v: 'draw', from: 'discard', to: 'hand:B', count: 1 })
    h.do('B', { v: 'undo.self' })
    expect(h.zone('discard')).toEqual(discard)
  })
})

describe('rewind.propose / rewind.confirm: going back is a joint decision', () => {
  it('shows the proposal to every view, and a second seat confirming restores the table', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const at1 = h.view(null)
    h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    const proposal = h.do('A', { v: 'rewind.propose', toSeq: 1 })
    expect(h.view('B').rewind).toEqual({ id: proposal.batch, toSeq: 1, by: 'A' })
    expect(h.view(null).rewind).toEqual({ id: proposal.batch, toSeq: 1, by: 'A' })

    const line = h.do('B', { v: 'rewind.confirm', proposal: proposal.batch })
    expect(line.outcome?.kind).toBe('restore')
    expect(h.view(null)).toEqual({ ...at1, seq: line.seq, rewind: null })
    expect(h.zone('hand:B')).toHaveLength(0)
  })

  it('cannot be confirmed by the proposer, with a stale id, or to a seq that is not in the past', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(h.try('A', { v: 'rewind.propose', toSeq: 1 }).ok).toBe(false)
    const p = h.do('A', { v: 'rewind.propose', toSeq: 0 })
    expect(h.try('A', { v: 'rewind.confirm', proposal: p.batch })).toMatchObject({ ok: false, reason: expect.stringMatching(/someone else/) })
    expect(h.try('B', { v: 'rewind.confirm', proposal: 'nope' }).ok).toBe(false)
    // A newer proposal replaces the old one.
    const p2 = h.do('B', { v: 'rewind.propose', toSeq: 0 })
    expect(h.try(null, { v: 'rewind.confirm', proposal: p.batch }).ok).toBe(false)
    expect(h.try(null, { v: 'rewind.confirm', proposal: p2.batch }).ok).toBe(true)
  })

  it('replays: the log reproduces the restored state and every seat\'s view', () => {
    const h = new Harness()
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 2 })
    const p = h.do('B', { v: 'rewind.propose', toSeq: 2 })
    h.do('A', { v: 'rewind.confirm', proposal: p.batch })
    h.do('A', { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const replayed = replay(h.initial, registry, h.log)
    expect(replayed).toEqual(h.state)
    for (const seat of ['A', 'B', null] as const) expect(h.view(seat)).toEqual(h.view(seat))
    expect(JSON.parse(JSON.stringify(h.log))).toEqual(h.log)
  })
})

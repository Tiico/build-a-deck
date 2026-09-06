import { describe, expect, it } from 'vitest'
import { applyPatch, diff, project } from '../src/index.js'
import { Harness, inZone, registry, zoneView } from './fixture.js'

describe('the observer (C8) sees everything', () => {
  it('reads every hand and the order and faces of hidden piles, which no seat and no table can', () => {
    const h = new Harness()
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const observer = project(h.state, registry, null, undefined, undefined, true)
    expect(inZone(observer, 'hand:A').map((c) => c.cardRef)).toEqual(h.zone('hand:A').map((id) => h.state.components[id]!.cardRef))
    expect(zoneView(observer, 'draw')).toMatchObject({ mode: 'order' })
    expect(inZone(observer, 'draw').every((c) => c.cardRef !== null)).toBe(true)
    // The table and the other seat still see backs and counts.
    expect(inZone(h.view(null), 'hand:A')).toHaveLength(0)
    expect(zoneView(h.view('B'), 'draw')).toMatchObject({ mode: 'count' })
  })
})

describe('flagging a moment (G3)', () => {
  it('is a line in the log with an optional note, from a seat, the table or a named observer, and changes nothing on the table', () => {
    const h = new Harness()
    const before = h.view(null)
    const line = h.do('A', { v: 'flag', note: 'Draken känns för stark här' })
    expect(line.intent).toEqual({ v: 'flag', note: 'Draken känns för stark här' })
    expect(line.outcome).toBeUndefined()
    expect({ ...h.view(null), seq: before.seq }).toEqual(before)
    h.do(null, { v: 'flag' })
    h.do(null, { v: 'flag', observer: 'Eva', note: 'Bo missade marknaden' })
    expect(h.try('A', { v: 'flag', note: 'x'.repeat(281) }).ok).toBe(false)
    // Flags are not play: they neither are undone nor contest anyone.
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('B', { v: 'flag', note: 'hm' })
    expect(h.view('A').undo).toEqual({ toSeq: 3, contested: false })
  })
})

describe('an ended session (C9) is visible in every view', () => {
  it('the snapshot says ended, and a patch carries the change', () => {
    const h = new Harness()
    expect(h.view(null).ended).toBe(false)
    const before = h.view('A')
    h.do(null, { v: 'session.end' })
    expect(h.view(null).ended).toBe(true)
    const patch = diff(before, h.view('A'))
    expect(patch.ops).toContainEqual({ op: 'ended', ended: true })
    expect(applyPatch(before, patch)).toEqual(h.view('A'))
  })
})

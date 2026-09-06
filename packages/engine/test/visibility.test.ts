import { describe, expect, it } from 'vitest'
import type { Snapshot } from '@byd/protocol'
import { Harness, SEATS, inZone, zoneView } from './fixture.js'
import type { TableState } from '../src/index.js'

describe('hidden information', () => {
  it('a hidden pile is a count for everyone, including the table', () => {
    const h = new Harness()
    for (const seat of SEATS) {
      const v = h.view(seat)
      expect(zoneView(v, 'draw')).toMatchObject({ mode: 'count', count: 10 })
      expect(inZone(v, 'draw')).toHaveLength(0)
    }
  })

  it('a drawn hand is visible only to its owner', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })

    const a = h.view('A')
    expect(zoneView(a, 'hand:A')).toMatchObject({ mode: 'order' })
    expect(inZone(a, 'hand:A').map((c) => c.cardRef)).toEqual(['dragon', 'knight', 'wizard'])

    for (const other of ['B', null] as const) {
      const v = h.view(other)
      expect(zoneView(v, 'hand:A')).toMatchObject({ mode: 'count', count: 3 })
      expect(inZone(v, 'hand:A')).toHaveLength(0)
    }
  })

  it('a face-down card on the table is an opaque handle even to the one who placed it', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const id = h.top('hand:A')
    h.do('A', { v: 'move', component: id, to: 'table', x: 10, y: 20 })

    for (const seat of SEATS) {
      const c = inZone(h.view(seat), 'table')
      expect(c).toHaveLength(1)
      expect(c[0]).toMatchObject({ id, cardRef: null, x: 10, y: 20 })
    }

    h.do('A', { v: 'flip', component: id, face: 'front' })
    for (const seat of SEATS) expect(inZone(h.view(seat), 'table')[0]!.cardRef).toBe('dragon')
  })

  it('showTo grants exactly one seat knowledge of one card, and moving it revokes that', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const shown = h.top('hand:A')
    h.do('A', { v: 'showTo', components: [shown], seats: ['B'] })

    const b = h.view('B')
    expect(zoneView(b, 'hand:A')).toMatchObject({ mode: 'count', count: 2 })
    expect(inZone(b, 'hand:A')).toEqual([expect.objectContaining({ id: shown, cardRef: 'dragon' })])
    expect(inZone(h.view(null), 'hand:A')).toHaveLength(0)

    h.do('A', { v: 'move', component: shown, to: 'table' })
    expect(inZone(h.view('B'), 'table')[0]!.cardRef).toBeNull()
  })

  it('peek grants the peeker knowledge until the card moves', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const id = h.top('table')
    h.do('B', { v: 'peek', components: [id] })

    expect(inZone(h.view('B'), 'table')[0]!.cardRef).toBe('dragon')
    expect(inZone(h.view('A'), 'table')[0]!.cardRef).toBeNull()
    expect(inZone(h.view(null), 'table')[0]!.cardRef).toBeNull()

    h.do(null, { v: 'move', component: id, to: 'discard' })
    expect(inZone(h.view('B'), 'discard')[0]!.cardRef).toBeNull()
  })

  it('reveal makes a hand card public without moving it', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const id = h.top('hand:A')
    h.do('A', { v: 'reveal', components: [id] })

    for (const other of ['B', null] as const) {
      const v = h.view(other)
      expect(zoneView(v, 'hand:A')).toMatchObject({ mode: 'count', count: 2 })
      expect(inZone(v, 'hand:A')).toEqual([expect.objectContaining({ id, cardRef: 'dragon' })])
    }
  })

  it('the owner sees their own hand regardless of which face is up', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(inZone(h.view('A'), 'hand:A')[0]).toMatchObject({ face: 'back', cardRef: 'dragon' })
  })

  it('never leaks a cardRef the seat has no independent right to see', () => {
    const h = new Harness(7)
    // The invariant is checked after every step, not just at the end.
    const checks: (() => void)[] = [
      () => h.do(null, { v: 'shuffle', pile: 'draw' }),
      () => h.do(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 }),
      () => h.do('A', { v: 'move', component: h.top('hand:A'), to: 'table' }),
      () => h.do('B', { v: 'peek', components: [h.top('table')] }),
      () => h.do('A', { v: 'showTo', components: [h.top('hand:A')], seats: ['B'] }),
      () => h.do('B', { v: 'move', component: h.top('hand:B'), to: 'table', x: 5 }),
      () => h.do('B', { v: 'flip', component: h.top('table'), face: 'front' }),
      () => h.do('A', { v: 'reveal', components: [h.top('hand:A')] }),
      () => h.do(null, { v: 'move', component: h.top('table'), to: 'discard' }),
      () => h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 }),
      () => h.do(null, { v: 'shuffle', pile: 'draw' }),
      () => h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' }),
      () => h.do('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 }),
      () => h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' }),
      () => h.do(null, { v: 'stack', component: { top: 'draw' }, onto: h.top('discard') }),
    ]
    for (const step of checks) {
      step()
      for (const seat of SEATS) assertNoLeak(h.state, h.view(seat), seat)
    }
  })
})

// An oracle written independently of `canSeeFace`: a seat may know a cardRef only if
// (a) the card is face-up in a zone everyone can see, (b) the seat owns the zone,
// (c) the seat was explicitly granted it (shown, peeked, or revealed to all),
// or (d) the card lies face-up on top of a pile (K15).
function assertNoLeak(state: TableState, view: Snapshot, seat: string | null): void {
  for (const c of view.components) {
    if (c.cardRef === null) continue
    const inst = state.components[c.id]!
    const zone = state.zones[inst.zone]!
    const faceUpPublic = zone.visibility === 'all' && inst.face === 'front'
    const owner = zone.visibility === 'owner' && zone.owner === seat
    const granted =
      inst.publicOverride || (seat !== null && (inst.shownTo.includes(seat) || inst.peekedBy.includes(seat)))
    const faceUpOnTop = zone.kind === 'pile' && zone.order[0] === inst.id && inst.face === 'front'
    expect(faceUpPublic || owner || granted || faceUpOnTop, `seat ${seat} sees ${c.cardRef} (${c.id}) in ${zone.id}`).toBe(true)
  }
  for (const z of view.zones) {
    const zone = state.zones[z.id]!
    const mayList = zone.visibility === 'all' || (zone.visibility === 'owner' && zone.owner === seat)
    expect(z.mode === 'order', `seat ${seat} sees order of ${z.id}`).toBe(mayList)
  }
}

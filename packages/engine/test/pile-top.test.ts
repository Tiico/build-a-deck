import { describe, expect, it } from 'vitest'
import { Harness, SEATS, inZone, registry, zoneView } from './fixture.js'
import { project, replay } from '../src/index.js'

// The top of a pile, named without its id (K15): a hidden pile never tells a view which card
// lies on top, so `stack` and `flip` may say `{ top: pile }` instead of a component id.
describe('the top of a pile as a source (K15)', () => {
  it('stacks the top of a hidden pile onto a loose card: the two form a pile, the draw pile shrinks', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const loose = h.top('table')
    const wasTop = h.top('draw')

    const line = h.do(null, { v: 'stack', component: { top: 'draw' }, onto: loose })

    const [pile] = h.piles()
    expect(pile).toBe(`z${line.seq}`)
    expect(h.zone(pile!)).toEqual([wasTop, loose])
    expect(h.zone('draw')).toHaveLength(8)
    expect(zoneView(h.view(null), 'draw')).toMatchObject({ mode: 'count', count: 8 })
    expect(inZone(h.view(null), 'draw')).toHaveLength(0)
  })

  it('flips the top of a hidden pile face-up: everyone then reads it, and the zone view names it as top', () => {
    const h = new Harness()
    const top = h.top('draw')
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })

    for (const seat of SEATS) {
      const v = h.view(seat)
      expect(zoneView(v, 'draw')).toMatchObject({ mode: 'count', count: 10, top })
      expect(inZone(v, 'draw')).toEqual([expect.objectContaining({ id: top, face: 'front', cardRef: 'dragon' })])
    }
  })

  it('the face-up top is hidden again when covered by a face-down card, and when turned back down', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const cover = h.top('table')
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })
    const shown = h.top('draw')
    expect(zoneView(h.view(null), 'draw')).toHaveProperty('top', shown)

    h.do(null, { v: 'move', component: cover, to: 'draw' })
    const v = h.view(null)
    expect(zoneView(v, 'draw')).toMatchObject({ mode: 'count', count: 10 })
    expect(zoneView(v, 'draw')).not.toHaveProperty('top')
    expect(inZone(v, 'draw')).toHaveLength(0)

    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(zoneView(h.view('B'), 'draw')).toHaveProperty('top', shown)
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'back' })
    expect(zoneView(h.view('B'), 'draw')).not.toHaveProperty('top')
    expect(inZone(h.view('B'), 'draw')).toHaveLength(0)
  })

  it('the top drawn into a hand is the owner\'s alone again: the knowledge belonged to the place', () => {
    const h = new Harness()
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(inZone(h.view('A'), 'hand:A')[0]).toMatchObject({ cardRef: 'dragon' })
    expect(inZone(h.view('B'), 'hand:A')).toHaveLength(0)
    expect(inZone(h.view(null), 'hand:A')).toHaveLength(0)
    expect(zoneView(h.view(null), 'draw')).not.toHaveProperty('top')
  })

  it('rejects an empty pile, a zone that is no pile, and stacking the top onto itself', () => {
    const h = new Harness()
    expect(h.try(null, { v: 'flip', component: { top: 'table' }, face: 'front' })).toMatchObject({ ok: false, reason: 'zone table is not a pile' })
    expect(h.try(null, { v: 'flip', component: { top: 'nowhere' }, face: 'front' })).toMatchObject({ ok: false, reason: 'unknown zone nowhere' })
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(h.try(null, { v: 'stack', component: { top: 'draw' }, onto: h.top('draw') })).toMatchObject({ ok: false, reason: 'cannot stack a component onto itself' })
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 9 })
    expect(h.try(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })).toMatchObject({ ok: false, reason: 'pile draw is empty' })
    expect(h.try(null, { v: 'stack', component: { top: 'draw' }, onto: h.top('table') })).toMatchObject({ ok: false, reason: 'pile draw is empty' })
  })

  it('a log with pile tops replays to the same table and the same views', () => {
    const h = new Harness()
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    h.do(null, { v: 'stack', component: { top: 'draw' }, onto: h.top('table') })
    h.do(null, { v: 'shuffle', pile: 'draw' })
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })
    const replayed = replay(h.initial, registry, h.log)
    expect(replayed).toEqual(h.state)
    for (const seat of SEATS) expect(project(replayed, registry, seat)).toEqual(project(h.state, registry, seat))
  })
})

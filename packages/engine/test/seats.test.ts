import { describe, expect, it } from 'vitest'
import { Harness, registry, twoSeatSetup } from './fixture.js'
import { applyPatch, diff, initialState, project } from '../src/index.js'

describe('seats in the projection', () => {
  it('lists every seat with its name, and a claim reaches the other views as a patch', () => {
    const h = new Harness()
    expect(h.view('B').seats).toEqual([
      { id: 'A', name: null, edge: 'S' },
      { id: 'B', name: null, edge: 'N' },
    ])
    const before = h.view('B')
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    const after = h.view('B')
    expect(after.seats).toEqual([
      { id: 'A', name: 'Ada', edge: 'S' },
      { id: 'B', name: null, edge: 'N' },
    ])
    const patch = diff(before, after)
    expect(patch.ops).toEqual([{ op: 'seat', seat: { id: 'A', name: 'Ada', edge: 'S' } }])
    expect(applyPatch(before, patch)).toEqual(after)
  })

  // Which edge a seat sits at (K12, #39) is worked out once, here, and carried in the seat's own
  // view — so that a picker drawing the ring of seats need never work it out again, and so that
  // nothing downstream can work it out differently. Every seat that has a hand is placed by
  // where that hand lies relative to the middle of the floor.
  it('names the edge each seat sits at, all four of them, from where its hand lies', () => {
    const setup = twoSeatSetup()
    const floor = setup.zones.find((z) => z.id === 'table')!.geometry
    const hands = { A: { x: -250, y: 340, w: 500, h: 60 }, B: { x: -250, y: -420, w: 500, h: 60 }, C: { x: 440, y: -250, w: 60, h: 500 }, D: { x: -500, y: -250, w: 60, h: 500 } }
    const zones = [
      ...setup.zones.filter((z) => z.kind !== 'hand'),
      ...Object.entries(hands).map(([owner, g]) => ({ id: `hand:${owner}`, kind: 'hand' as const, name: 'Hand', visibility: 'owner' as const, owner, returnTo: 'draw', geometry: { ...g, rot: 0 } })),
    ]
    expect(floor).toEqual({ x: -500, y: -300, w: 1000, h: 600, rot: 0 })
    const state = initialState('v1', { ...setup, seats: ['A', 'B', 'C', 'D'], zones }, registry)
    expect(project(state, registry, null).seats.map((s) => s.edge)).toEqual(['S', 'N', 'E', 'W'])
  })

  // And the deliberate silence: a seat the table gives no hand is at no edge, and the view says
  // so. A guess would be worse than nothing — it would put the seat somewhere it is not, which
  // is exactly how every seat once ended up drawn on the same spot (#39).
  it('says a seat with no hand is at no edge rather than guessing one', () => {
    const setup = twoSeatSetup()
    const state = initialState('v1', { ...setup, zones: setup.zones.filter((z) => z.id !== 'hand:B') }, registry)
    expect(project(state, registry, null).seats).toEqual([
      { id: 'A', name: null, edge: 'S' },
      { id: 'B', name: null, edge: null },
    ])
  })
})

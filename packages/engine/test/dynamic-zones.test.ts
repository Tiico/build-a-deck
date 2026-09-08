import { describe, expect, it } from 'vitest'
import { Harness, SEATS, inZone, zoneView } from './fixture.js'

// Two cards on the table, three ids to reason about: the pile forms where the lower card lies.
function twoOnTable(h: Harness) {
  h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
  const [upper, lower] = h.zone('table') as [string, string]
  h.do(null, { v: 'move', component: lower, to: 'table', x: 100, y: 50, rot: 15 })
  h.do(null, { v: 'move', component: upper, to: 'table', x: -100, y: 0 })
  return { upper, lower }
}

describe('ad hoc piles (K1)', () => {
  it('stacking a loose card onto another loose card forms a pile where the lower card lay', () => {
    const h = new Harness()
    const { upper, lower } = twoOnTable(h)
    const line = h.do(null, { v: 'stack', component: upper, onto: lower })

    const [pile] = h.piles()
    expect(pile).toBe(`z${line.seq}`)
    expect(h.zone(pile!)).toEqual([upper, lower])
    expect(h.zone('table')).toEqual([])
    expect(h.state.zones[pile!]).toMatchObject({
      kind: 'pile',
      dynamic: true,
      parent: 'table',
      visibility: 'all',
      // Table coordinates: the floor starts at (-500, -300), the lower card lay at (100, 50) in it.
      geometry: { x: -400, y: -250, rot: 15 },
    })
  })

  it('a dynamic pile inherits the visibility of its area and is reported to everyone', () => {
    const h = new Harness()
    const { upper, lower } = twoOnTable(h)
    h.do(null, { v: 'flip', component: lower, face: 'front' })
    h.do(null, { v: 'stack', component: upper, onto: lower })
    const [pile] = h.piles()

    for (const seat of SEATS) {
      const v = h.view(seat)
      expect(zoneView(v, pile!)).toMatchObject({ mode: 'order', dynamic: true, order: [upper, lower] })
      // The lower card (knight) is face-up and readable; the upper one (dragon) is face-down and not.
      expect(inZone(v, pile!).map((c) => c.cardRef)).toEqual([null, 'knight'])
    }
  })

  it('a dynamic pile can be shuffled, drawn from and split like any pile', () => {
    const h = new Harness(3)
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 4 })
    const [a, b, c, d] = h.zone('table') as [string, string, string, string]
    h.do(null, { v: 'stack', component: a, onto: b })
    const [pile] = h.piles()
    h.do(null, { v: 'stack', component: c, onto: b })
    h.do(null, { v: 'stack', component: d, onto: b })
    expect(h.zone(pile!)).toHaveLength(4)

    h.do(null, { v: 'shuffle', pile: pile! })
    expect(h.zone(pile!).every((id) => id.startsWith('r'))).toBe(true)

    h.do('A', { v: 'draw', from: pile!, to: 'hand:A', count: 1 })
    expect(h.zone(pile!)).toHaveLength(3)

    h.do(null, { v: 'split', pile: pile!, at: 2, x: 300, y: 300 })
    const piles = h.piles()
    expect(piles).toHaveLength(1)
    // Splitting two off a three-pile dissolves the source; the new pile has two.
    expect(h.zone(piles[0]!)).toHaveLength(2)
    expect(h.state.zones[pile!]).toBeUndefined()
  })

  it('dissolves back into the area when one card remains, at the pile position, keeping granted knowledge', () => {
    const h = new Harness()
    const { upper, lower } = twoOnTable(h)
    h.do(null, { v: 'stack', component: upper, onto: lower })
    const [pile] = h.piles()
    h.do('B', { v: 'peek', components: [lower] })

    h.do(null, { v: 'move', component: upper, to: 'discard' })

    expect(h.state.zones[pile!]).toBeUndefined()
    expect(h.state.components[lower]).toMatchObject({ zone: 'table', x: 100, y: 50, rot: 15 })
    expect(inZone(h.view('B'), 'table')[0]!.cardRef).toBe('knight')
    expect(inZone(h.view('A'), 'table')[0]!.cardRef).toBeNull()
    expect(h.view(null).zones.find((z) => z.id === pile)).toBeUndefined()
  })

  it('stacking onto a card already in a pile joins that pile directly above it', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
    const [top, mid] = h.zone('discard') as [string, string]
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const loose = h.top('table')
    h.do(null, { v: 'stack', component: loose, onto: mid })
    expect(h.zone('discard')).toEqual([top, loose, mid, expect.any(String)])
    expect(h.piles()).toEqual([])
  })

  it('movePile moves a whole pile as one unit into an area', () => {
    const h = new Harness()
    const { upper, lower } = twoOnTable(h)
    h.do(null, { v: 'stack', component: upper, onto: lower })
    const [pile] = h.piles()
    h.do(null, { v: 'movePile', pile: pile!, to: 'table', x: -400, y: -200, rot: 90 })
    expect(h.state.zones[pile!]!.geometry).toMatchObject({ x: -400, y: -200, rot: 90 })
    expect(h.zone(pile!)).toEqual([upper, lower])
    for (const seat of SEATS) {
      expect(zoneView(h.view(seat), pile!).geometry).toMatchObject({ x: -400, y: -200, rot: 90 })
    }
  })

  it('setup piles can be moved too, without changing their visibility', () => {
    const h = new Harness()
    h.do(null, { v: 'movePile', pile: 'draw', to: 'table', x: 0, y: 0 })
    expect(h.state.zones['draw']).toMatchObject({ visibility: 'none', geometry: { x: 0, y: 0 } })
    expect(zoneView(h.view('A'), 'draw')).toMatchObject({ mode: 'count', count: 10 })
  })

  it('a split without a target creates a new pile next to a setup pile on the floor', () => {
    const h = new Harness()
    h.do(null, { v: 'split', pile: 'draw', at: 4, x: -100, y: 0 })
    const [pile] = h.piles()
    expect(h.state.zones[pile!]).toMatchObject({ parent: 'table', visibility: 'all', geometry: { x: -100, y: 0 } })
    expect(h.zone(pile!)).toHaveLength(4)
    expect(h.zone('draw')).toHaveLength(6)
  })

  it('rejects movePile on a non-pile and into a non-area', () => {
    const h = new Harness()
    const bad1 = h.try(null, { v: 'movePile', pile: 'table', to: 'table', x: 0, y: 0 })
    expect(bad1).toMatchObject({ ok: false, reason: /not a pile/ })
    const bad2 = h.try(null, { v: 'movePile', pile: 'draw', to: 'discard', x: 0, y: 0 })
    expect(bad2).toMatchObject({ ok: false, reason: /not an area/ })
    const bad3 = h.try(null, { v: 'split', pile: 'draw', at: 2 })
    expect(bad3).toMatchObject({ ok: false, reason: /needs x and y/ })
  })
})

describe('dynamic piles lie in table coordinates (K1, K2)', () => {
  it('a pile created by stacking stands where the lower card lay, and the last card returns there', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
    const [a, b] = h.zone('table') as [string, string]
    // The floor spans (-500,-300)…(500,300); a card at relative (100, 50) lies at (-400, -250).
    h.do(null, { v: 'move', component: b, to: 'table', x: 100, y: 50 })
    h.do(null, { v: 'stack', component: a, onto: b })
    const [pile] = h.piles() as [string]
    expect(h.state.zones[pile]!.geometry).toMatchObject({ x: -400, y: -250 })
    h.do(null, { v: 'draw', from: pile, to: 'discard', count: 1 })
    expect(h.state.components[b]).toMatchObject({ zone: 'table', x: 100, y: 50 })
  })

  it('split without a target places the new pile at table coordinates, like movePile', () => {
    const h = new Harness()
    h.do(null, { v: 'split', pile: 'draw', at: 2, x: 120, y: -80 })
    const [pile] = h.piles() as [string]
    expect(h.state.zones[pile]!.geometry).toMatchObject({ x: 120, y: -80 })
    h.do(null, { v: 'draw', from: pile, to: 'discard', count: 1 })
    const last = Object.values(h.state.components).find((c) => c.zone === 'table')!
    expect(last).toMatchObject({ x: 620, y: 220 })
  })
})

// A pile squares its cards (K1, decided 2026-09-07): a card that joins a pile takes the pile's
// rotation, whatever it had, as a hand does when it evens a pile. State and picture say the same.
describe('a pile squares its cards', () => {
  it('a turned card stacked onto a loose card, a card moved into a pile, and a card drawn into one all take the pile\'s rotation', () => {
    const h = new Harness()
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 3 })
    const [turned, lower, another] = h.zone('table') as [string, string, string]
    h.do(null, { v: 'move', component: lower, to: 'table', x: 100, y: 50, rot: 15 })
    h.do(null, { v: 'move', component: turned, to: 'table', x: -100, y: 0, rot: 90 })
    h.do(null, { v: 'stack', component: turned, onto: lower })
    const [pile] = h.piles()
    expect(h.state.components[turned]?.rot).toBe(15)
    expect(h.state.components[lower]?.rot).toBe(15)

    h.do(null, { v: 'move', component: another, to: 'table', x: 0, y: 0, rot: 45 })
    h.do(null, { v: 'move', component: another, to: 'discard', rot: 45 })
    expect(h.state.components[another]?.rot).toBe(0)
    h.do(null, { v: 'draw', from: 'discard', to: pile!, count: 1 })
    expect(h.state.components[another]?.rot).toBe(15)
    // Dissolving leaves the last card with the pile's rotation, as before.
    h.do(null, { v: 'draw', from: pile!, to: 'discard', count: 2 })
    expect(h.state.components[lower]).toMatchObject({ zone: 'table', rot: 15 })
  })
})

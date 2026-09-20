import { describe, expect, it } from 'vitest'
import { CARDS, Harness, inZone, registry, twoSeatSetup, zoneView } from './fixture.js'
import { replay, type SetupDef } from '../src/index.js'

// A pile may name one card of the deck as its bottom card (K23, #331): it lies last, face up or
// face down as the setup says, a shuffle leaves it there, and the role is the pile's and not the
// card's — away from the pile it is an ordinary card, back in the pile it lies last again.
function withBottom(face: 'front' | 'back' = 'front'): SetupDef {
  const setup = twoSeatSetup()
  return { ...setup, zones: setup.zones.map((z) => (z.id === 'draw' ? { ...z, bottom: { cardRef: 'ogre', face } } : z)) }
}

const refs = (h: Harness, zone: string) => h.zone(zone).map((id) => h.state.components[id]!.cardRef)

describe('a pile with a bottom card (K23)', () => {
  it('lies last in the pile from the start, on the face the setup chose, wherever the deck listed it', () => {
    const setup = withBottom('front')
    // Listed first in the deck, so the order is the setup's rule and not the list's luck.
    setup.components = [...setup.components].reverse()
    const h = new Harness(1, setup)
    expect(refs(h, 'draw')).toHaveLength(10)
    expect(refs(h, 'draw').at(-1)).toBe('ogre')
    expect(h.state.components[h.zone('draw').at(-1)!]!.face).toBe('front')
    expect(new Harness(1, withBottom('back')).state.components[h.zone('draw').at(-1)!]!.face).toBe('back')
  })

  it('a shuffle mixes every other card and leaves the bottom card last, and the log replays to the same table', () => {
    const h = new Harness(3, withBottom())
    const before = refs(h, 'draw')
    for (let i = 0; i < 3; i++) h.do(null, { v: 'shuffle', pile: 'draw' })
    const after = refs(h, 'draw')
    expect(after.at(-1)).toBe('ogre')
    expect(after.slice(0, -1)).not.toEqual(before.slice(0, -1))
    expect([...after].sort()).toEqual([...CARDS].sort())
    // Everything is rekeyed, the bottom card too: it may not be tracked through a shuffle either.
    expect(h.zone('draw').every((id) => id.startsWith('r'))).toBe(true)
    expect(replay(h.initial, registry, h.log)).toEqual(h.state)
  })

  it('is drawn like any card once it is the last one, with no lock and no confirmation', () => {
    const h = new Harness(1, withBottom())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 9 })
    expect(refs(h, 'draw')).toEqual(['ogre'])
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(refs(h, 'draw')).toEqual([])
    expect(inZone(h.view('A'), 'hand:A').map((c) => c.cardRef)).toEqual(['ogre'])
  })

  it('is an ordinary card in another pile, and lies last again when it comes back to its own', () => {
    const h = new Harness(1, withBottom())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 9 })
    const ogre = h.top('draw')
    h.do(null, { v: 'move', component: ogre, to: 'discard' })
    h.do(null, { v: 'draw', from: 'table', to: 'discard', count: 2 })
    // Placed on top of the discard pile by the two that followed it: no bottom role there.
    expect(refs(h, 'discard')).toEqual(['dragon', 'knight', 'ogre'])
    h.do(null, { v: 'move', component: h.zone('discard')[1]!, to: 'discard', index: 2 })
    expect(refs(h, 'discard')).toEqual(['dragon', 'ogre', 'knight'])

    // Back in the draw pile at the top, and it lies last all the same; a later shuffle keeps it.
    h.do(null, { v: 'draw', from: 'table', to: 'draw', count: 3 })
    h.do(null, { v: 'move', component: h.zone('discard')[1]!, to: 'draw', index: 0 })
    expect(refs(h, 'draw').at(-1)).toBe('ogre')
    expect(refs(h, 'draw')).toHaveLength(4)
    h.do(null, { v: 'shuffle', pile: 'draw' })
    expect(refs(h, 'draw').at(-1)).toBe('ogre')
  })

  it('nothing is put under it: a card played to the bottom of the pile lands above the bottom card', () => {
    const h = new Harness(1, withBottom())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const dragon = h.top('table')
    h.do(null, { v: 'move', component: dragon, to: 'draw', index: 99 })
    expect(refs(h, 'draw').slice(-2)).toEqual(['dragon', 'ogre'])
  })

  it('holds through a batch: several moves in one envelope return it to the bottom', () => {
    const h = new Harness(1, withBottom())
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 10 })
    const [witch, bard, ogre] = h.zone('table').slice(-3) as [string, string, string]
    expect(h.state.components[ogre]!.cardRef).toBe('ogre')
    h.batch(null, { v: 'move', component: ogre, to: 'draw' }, { v: 'move', component: bard, to: 'draw' }, { v: 'move', component: witch, to: 'draw' })
    expect(refs(h, 'draw')).toEqual(['witch', 'bard', 'ogre'])
  })

  it('a seat released returns its hand to the pile and reshuffles it, still with the bottom card last', () => {
    const h = new Harness(2, withBottom())
    h.do(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 4 })
    h.do(null, { v: 'seat.release', seat: 'A' })
    expect(refs(h, 'draw')).toHaveLength(10)
    expect(refs(h, 'draw').at(-1)).toBe('ogre')
    expect(replay(h.initial, registry, h.log)).toEqual(h.state)
  })
})

describe('what a view learns about the bottom card (K23, K15)', () => {
  it('a face-up bottom card of a hidden pile is public: the zone names it and every view reads it', () => {
    const h = new Harness(1, withBottom('front'))
    const ogre = h.zone('draw').at(-1)!
    for (const seat of ['A', 'B', null]) {
      const v = h.view(seat)
      expect(zoneView(v, 'draw')).toMatchObject({ mode: 'count', count: 10, bottom: { id: ogre } })
      expect(inZone(v, 'draw')).toEqual([expect.objectContaining({ id: ogre, face: 'front', cardRef: 'ogre' })])
    }
  })

  it('a face-down bottom card of a hidden pile is only its presence: no id, no cardRef, no component', () => {
    const h = new Harness(1, withBottom('back'))
    for (const seat of ['A', 'B', null]) {
      const v = h.view(seat)
      const z = zoneView(v, 'draw')
      expect(z).toMatchObject({ mode: 'count', count: 10, bottom: {} })
      expect(z.mode === 'count' && z.bottom && 'id' in z.bottom).toBe(false)
      expect(inZone(v, 'draw')).toEqual([])
      expect(JSON.stringify(v)).not.toContain('ogre')
    }
  })

  it('a public pile names its bottom card too; a lone card and an empty pile have no bottom', () => {
    const setup = withBottom('back')
    setup.zones = setup.zones.map((z) => (z.id === 'draw' ? { ...z, visibility: 'all' as const } : z))
    const h = new Harness(1, setup)
    const ogre = h.zone('draw').at(-1)!
    expect(zoneView(h.view(null), 'draw')).toMatchObject({ mode: 'order', bottom: { id: ogre } })
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 9 })
    expect(zoneView(h.view(null), 'draw')).not.toHaveProperty('bottom')
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    expect(zoneView(h.view(null), 'draw')).not.toHaveProperty('bottom')
    expect(zoneView(new Harness(1, withBottom('back')).view(null), 'discard')).not.toHaveProperty('bottom')
  })
})

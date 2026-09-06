import { describe, expect, it } from 'vitest'
import { CARD, CARDS, Harness, inZone, zoneView } from './fixture.js'

const spec = (cardRef: string) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })

describe('version.change (C7): the deck follows the project, the table stays where it is', () => {
  it('adds missing copies face down in the deck zone, removes surplus from the deck first, keeps placed cards, and pins the new version', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 }) // dragon, knight
    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 1 }) // wizard
    const wizard = h.top('table')

    // v2: three dragons, no knight, a new phoenix, no rogue; everything else as before.
    const next = [spec('dragon'), spec('dragon'), spec('dragon'), spec('wizard'), spec('phoenix'), ...CARDS.slice(4).map(spec)]
    const line = h.do(null, { v: 'version.change', to: 'v2', components: next })
    expect(line.intent.v).toBe('version.change')
    expect(h.state.version).toBe('v2')

    const refs = (zone: string) => h.zone(zone).map((id) => h.state.components[id]!.cardRef)
    expect(refs('hand:A')).toEqual(['dragon'])
    expect(h.state.components[wizard]).toMatchObject({ zone: 'table', cardRef: 'wizard' })
    expect(refs('draw').filter((r) => r === 'dragon')).toHaveLength(2)
    expect(refs('draw')).toContain('phoenix')
    expect(refs('draw')).not.toContain('rogue')
    expect(Object.values(h.state.components).map((c) => c.cardRef).sort()).toEqual(
      ['dragon', 'dragon', 'dragon', 'wizard', 'phoenix', ...CARDS.slice(4)].sort(),
    )
    // The setup now describes v2, so a reset deals the new deck.
    h.do(null, { v: 'setup.reset' })
    expect(refs('draw').filter((r) => r === 'dragon')).toHaveLength(3)
    expect(refs('draw')).not.toContain('knight')
  })

  it('removes surplus copies from wherever they are when the deck has none left', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 }) // dragon in hand
    h.do(null, { v: 'version.change', to: 'v2', components: CARDS.slice(1).map(spec) })
    expect(inZone(h.view('A'), 'hand:A')).toHaveLength(0)
    expect(zoneView(h.view(null), 'draw')).toMatchObject({ count: 9 })
  })

  it('is deterministic: the new instances get ids from the counter, and the line replays', () => {
    const h = new Harness()
    const line = h.do(null, { v: 'version.change', to: 'v2', components: [...CARDS.map(spec), spec('phoenix')] })
    expect(line.outcome).toBeUndefined()
    expect(h.state.components['c10']).toMatchObject({ cardRef: 'phoenix', zone: 'draw', face: 'back' })
  })
})

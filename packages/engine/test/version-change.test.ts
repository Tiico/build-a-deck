import { describe, expect, it } from 'vitest'
import { CARD, CARDS, Harness, inZone, twoSeatSetup, zoneView } from './fixture.js'
import { applyPatch, diff } from '../src/index.js'

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

  // Every screen says which version it plays (C7): a TV's title, the book a phone hands out
  // (#677). It is the view's, so it changes in the very patch that carries the line, for every
  // seat alike — it is no secret which version is on the table.
  it('says in the view which version the table plays, and a patch carries the change', () => {
    const h = new Harness()
    const before = h.view('A')
    expect(before.version).toBe('v1')
    h.do(null, { v: 'version.change', to: 'v2', components: CARDS.map(spec) })
    const after = h.view('A')
    expect(after.version).toBe('v2')
    expect(h.view(null).version).toBe('v2')
    const patch = diff(before, after)
    expect(patch.ops).toContainEqual({ op: 'version', version: 'v2' })
    expect(applyPatch(before, patch)).toEqual(after)
  })

  // A pile's own actions are the version's (K14), as its name, its shortcut and where it shows its
  // cards are: «Uppdatera bordet» after rewriting what the deck asks for left the table offering
  // the start version's action until it was opened anew. The line carries the setup's zones, and
  // a zone the table has takes them; its cards, and the piles stacked during play, stay.
  it('gives every zone the table has its definition in the new version, and keeps its cards', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const before = h.view('A')
    const deal = { id: 'a1', label: 'Dela ut tre', steps: [{ v: 'deal' as const, each: { of: 'number' as const, n: 3 }, to: { at: 'hands' as const }, face: 'keep' as const }] }
    const zones = twoSeatSetup().zones.map((z) => (z.id === 'draw' ? { ...z, name: 'Leken', actions: [deal], shortcut: { label: 'Lägg under', at: 'bottom' as const } } : z))
    h.do(null, { v: 'version.change', to: 'v2', components: CARDS.map(spec), zones })

    expect(zoneView(h.view('A'), 'draw')).toMatchObject({ name: 'Leken', actions: [deal], shortcut: { label: 'Lägg under', at: 'bottom' }, count: 8 })
    expect(inZone(h.view('A'), 'hand:A')).toHaveLength(2)
    const patch = diff(before, h.view('A'))
    expect(applyPatch(before, patch)).toEqual(h.view('A'))
    // And a reset deals the new version's piles, not the start's.
    h.do(null, { v: 'setup.reset' })
    expect(zoneView(h.view('A'), 'draw')).toMatchObject({ name: 'Leken', actions: [deal] })
  })

  // A line written before zones travelled carries none, and leaves the piles as it found them —
  // which is what such a line meant, so an old log replays as it did.
  it('leaves the zones as they were when the line carries none', () => {
    const h = new Harness()
    h.do(null, { v: 'version.change', to: 'v2', components: CARDS.map(spec) })
    expect(zoneView(h.view('A'), 'draw')).toMatchObject({ name: 'Draghög' })
  })

  // A pile with cards in it cannot become an area under them: what lies there has an order and
  // no place, and the line would leave a zone the cards do not fit.
  it('refuses a zone that changes kind under the table', () => {
    const h = new Harness()
    const zones = twoSeatSetup().zones.map((z) => (z.id === 'draw' ? { ...z, kind: 'area' as const } : z))
    expect(h.try(null, { v: 'version.change', to: 'v2', components: CARDS.map(spec), zones })).toMatchObject({ ok: false, reason: expect.stringMatching(/zone draw is a pile/) })
  })
})

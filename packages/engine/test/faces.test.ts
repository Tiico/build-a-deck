import { describe, expect, it } from 'vitest'
import { CARDS, Harness, registry, zoneView } from './fixture.js'
import { componentOf, project, type FaceHashes } from '../src/index.js'

// Texture hashes per card and face, as the server computes them from the compiled deck.
const faces: FaceHashes = {
  dragon: { front: 'f-dragon', back: 'b-std' },
  knight: { front: 'f-knight', back: 'b-std' },
}

describe('face hashes in the projection (TUNN-SKIVA §5)', () => {
  it('gives the front hash only where the seat may see the face, the back hash for any visible component', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    h.do('A', { v: 'draw', from: 'draw', to: 'table', count: 1 })
    const onTable = h.top('table')

    const a = project(h.state, registry, 'A', faces)
    const inHand = a.components.find((c) => c.zone === 'hand:A')!
    expect(inHand.faces).toEqual({ front: 'f-dragon', back: 'b-std' })
    expect(a.components.find((c) => c.id === onTable)!.faces).toEqual({ back: 'b-std' })

    const b = project(h.state, registry, 'B', faces)
    expect(b.components.find((c) => c.id === onTable)!.faces).toEqual({ back: 'b-std' })
    expect(JSON.stringify(b)).not.toContain('f-dragon')
    expect(JSON.stringify(b)).not.toContain('f-knight')

    h.do(null, { v: 'flip', component: onTable, face: 'front' })
    expect(project(h.state, registry, 'B', faces).components.find((c) => c.id === onTable)!.faces).toEqual({ front: 'f-knight', back: 'b-std' })
  })

  // A face-down pile (#313). Physically its back is the one thing about it everybody can see, and
  // a deck whose cards carry their own back (#14) has to wear that one from the first frame — not
  // the deck's default until somebody draws. The component itself stays out of the projection: a
  // hidden pile does not hand out an id, a position or a rotation (K15), so the back travels on
  // the zone, which is the one thing the seat is already allowed to know the size of.
  it('gives a face-down pile the back its top card wears, and still nothing else about it', () => {
    const h = new Harness()
    // Every card a back of its own, so that reading the right one cannot be a coincidence: the
    // deck's own default would be a single shared value and would pass a weaker test.
    const own: FaceHashes = Object.fromEntries(CARDS.map((card) => [card, { front: `f-${card}`, back: `b-${card}` }]))
    const pile = zoneView(project(h.state, registry, 'A', own), 'draw')
    expect(pile.mode).toBe('count')
    const top = componentOf(h.state, h.state.zones['draw']!.order[0]!)

    expect(pile.mode === 'count' && pile.back).toBe(`b-${top.cardRef}`)

    // And the back is the whole of it: no id, no cardRef, no front — read off the frame itself and
    // not off the shape we happen to have built (B6).
    const raw = JSON.stringify(pile)
    expect(raw).not.toContain(top.id)
    expect(raw).not.toContain(`f-${top.cardRef}`)
    expect(raw).not.toContain(`"cardRef"`)
  })

  // When the top changes, the back changes with it.
  it('wears the next card’s back once the top one has been drawn away', () => {
    const h = new Harness()
    const own: FaceHashes = Object.fromEntries(CARDS.map((card) => [card, { front: `f-${card}`, back: `b-${card}` }]))
    const before = componentOf(h.state, h.state.zones['draw']!.order[0]!)
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const after = componentOf(h.state, h.state.zones['draw']!.order[0]!)
    expect(after.cardRef).not.toBe(before.cardRef)
    const pile = zoneView(project(h.state, registry, 'A', own), 'draw')
    expect(pile.mode === 'count' && pile.back).toBe(`b-${after.cardRef}`)
  })

  it('leaves faces out entirely when the session has no textures', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(project(h.state, registry, 'A').components[0]!.faces).toBeUndefined()
  })
})

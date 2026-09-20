import { describe, expect, it } from 'vitest'
import { Harness, SEATS, registry, zoneView } from './fixture.js'
import { project, type FaceHashes } from '../src/index.js'

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

  it('leaves faces out entirely when the session has no textures', () => {
    const h = new Harness()
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(project(h.state, registry, 'A').components[0]!.faces).toBeUndefined()
  })
})

// Per-group backs (#14): the back a card wears is its row's group's, not one back for the deck.
const grouped: FaceHashes = Object.fromEntries(
  ['dragon', 'knight', 'wizard', 'rogue', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre'].map((ref, i) => [ref, { front: `f-${ref}`, back: i % 2 === 0 ? 'b-red' : 'b-blue' }]),
)

describe('the back of a hidden pile (#313)', () => {
  it('carries the top card\'s back hash on the zone, and never its front hash or identity', () => {
    const h = new Harness()
    const draw = () => zoneView(project(h.state, registry, 'B', grouped), 'draw')
    expect(draw()).toMatchObject({ mode: 'count', count: 10, back: 'b-red' })
    expect(draw()).not.toHaveProperty('top')
    expect(JSON.stringify(draw())).not.toContain('f-dragon')
    expect(JSON.stringify(draw())).not.toContain('dragon')

    // The top changes: so does the back.
    h.do('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(draw()).toMatchObject({ count: 9, back: 'b-blue' })
    h.do(null, { v: 'shuffle', pile: 'draw' })
    const top = h.state.components[h.top('draw')]!.cardRef
    expect(draw()).toMatchObject({ count: 9, back: grouped[top]!['back'] })
    for (const seat of SEATS) expect(JSON.stringify(project(h.state, registry, seat, grouped).zones)).not.toContain('f-')
  })

  it('carries no back for an empty pile, none without textures, and none when the top is face-up and named', () => {
    const h = new Harness()
    expect(zoneView(project(h.state, registry, null), 'draw')).not.toHaveProperty('back')

    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'front' })
    const shown = zoneView(project(h.state, registry, null, grouped), 'draw')
    expect(shown).toHaveProperty('top', h.top('draw'))
    expect(shown).not.toHaveProperty('back')
    h.do(null, { v: 'flip', component: { top: 'draw' }, face: 'back' })
    expect(zoneView(project(h.state, registry, null, grouped), 'draw')).toMatchObject({ back: 'b-red' })

    h.do(null, { v: 'draw', from: 'draw', to: 'table', count: 10 })
    const empty = zoneView(project(h.state, registry, null, grouped), 'draw')
    expect(empty).toMatchObject({ mode: 'count', count: 0 })
    expect(empty).not.toHaveProperty('back')
  })
})

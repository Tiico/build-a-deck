import { describe, expect, it } from 'vitest'
import { Harness, registry } from './fixture.js'
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

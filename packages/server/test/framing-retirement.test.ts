import { describe, expect, it, vi } from 'vitest'
import { applyEdit, type EditIntent } from '../src/edits.js'
import { ProjectActor } from '../src/project-actor.js'
import { MemoryProjectStore, ProjectDoc, deckFromProject, liftDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// Each card's own departure from the measure is retired (#607). It was set in one place only —
// «Bildernas mått» on the wall — and once the picture carried its own crop (L22) that place said
// nothing a designer needed. A card that wants another cut uses a picture cropped for it.
//
// Retiring it is a migration like `anchor`'s (#221): a project's history is written once and never
// rewritten (B4), so every stored version has to go on opening, and the departure it carried has
// to be lifted off at the door rather than left to crop cards nobody can uncrop.

const storedBeforeTheRetirement = () => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        front: { base: [{ kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, frame: { fill: 0.8 } }], variants: {} },
      },
    },
    rows: [{ id: 'dragon', fields: { art: 'a.png', antal: 1 } }],
    icons: {},
    framing: { 'dragon/art': { zoom: 1.4, dy: -0.1 } },
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('a project stored with a card’s own departure (#607)', () => {
  it('is lifted out of it at the door', () => {
    expect(liftDoc(storedBeforeTheRetirement())).not.toHaveProperty('framing')
  })

  it('comes out of the store without it, and out of the history the same way', async () => {
    const store = new MemoryProjectStore()
    await store.create('p', storedBeforeTheRetirement() as unknown as ProjectDoc)

    const rec = await store.load('p')
    const old = await store.at('p', 1)

    expect(rec).not.toHaveProperty('framing')
    expect(old).not.toHaveProperty('framing')
    expect(() => ProjectDoc.parse(rec)).not.toThrow()
  })

  it('hands the deck no departure to compile with', () => {
    expect(deckFromProject(liftDoc(storedBeforeTheRetirement()) as unknown as ProjectDoc)).not.toHaveProperty('framing')
  })
})

describe('an edit that set a departure (#607)', () => {
  const setFraming = { v: 'setFraming', cardRef: 'dragon', field: 'art', framing: { zoom: 1.5 } } as unknown as EditIntent

  it('is refused, because there is nothing left for it to set', () => {
    const doc = liftDoc(storedBeforeTheRetirement()) as unknown as ProjectDoc
    expect(() => applyEdit(doc, setFraming)).toThrow(/setFraming/)
  })

  it('is passed over in a stored log, and the rest of the log still plays', async () => {
    const store = new MemoryProjectStore()
    await store.create('p', storedBeforeTheRetirement() as unknown as ProjectDoc)
    await store.appendEdits('p', [
      { seq: 1, at: '2026-09-01T10:00:00.000Z', intent: setFraming },
      { seq: 2, at: '2026-09-01T10:01:00.000Z', intent: { v: 'rename', name: 'Skogens andar' } },
    ])
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const actor = (await ProjectActor.load('p', store))!

    expect(actor.doc.name).toBe('Skogens andar')
    expect(actor.doc).not.toHaveProperty('framing')
    expect(quiet).toHaveBeenCalledWith(expect.stringContaining('"seq":1'))
    quiet.mockRestore()
  })
})

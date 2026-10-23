import { describe, expect, it } from 'vitest'
import type { Element } from '@byd/template'
import { ProjectActor } from '../src/project-actor.js'
import { MemoryProjectStore, type ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// A game made with the classic frame before #1224 (#1238) holds a square picture in every version of
// it, and versions are never rewritten (B4). So the corners are lifted at the door: the store's read,
// a version out of the history, and the log played on top of the saved version all come out with
// the frame's rounded picture, while what is stored stays exactly as it was written.

const classicFront = (): Element[] => [
  { kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#f4ead8' },
  { kind: 'shape', id: 'frame', x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
  { kind: 'shape', id: 'artbg', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#e6d9c2', radiusMm: 2 },
  { kind: 'image', id: 'art', x: 4, y: 4, w: 55, h: 36, bind: { field: 'Bild' }, fit: 'cover' },
]
const storedBefore1224 = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Västern',
    template: { faces: { front: { base: classicFront(), variants: {} }, back: { base: [], variants: {} } } },
    rows: [{ id: 'sheriff', fields: { title: 'Sheriffen', Bild: 'a.png', antal: 1 } }],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  } as ProjectDoc
}
const art = (doc: ProjectDoc | null) => doc!.template.faces['front']!.base.find((e) => e.kind === 'image')

describe('a game made with a starter frame before #1224, as the server reads it (#1238)', () => {
  it('comes out of the store, and out of its history, with the frame’s rounded picture', async () => {
    const store = new MemoryProjectStore()
    await store.create('p', storedBefore1224())
    expect(art(await store.load('p'))).toMatchObject({ radiusMm: 2.3 })
    expect(art(await store.at('p', 1))).toMatchObject({ radiusMm: 2.3 })
  })

  // A face put back whole after the last save, by a reorder or a restore made before #1224, holds
  // the square picture again; the log played on top of the saved version is read through the door
  // as the version itself is.
  it('reads the log played on top of the saved version through the same door', async () => {
    const store = new MemoryProjectStore()
    await store.create('p', storedBefore1224())
    await store.appendEdits('p', [{ seq: 1, at: '2026-10-01T10:00:00.000Z', intent: { v: 'replaceFace', face: 'front', base: [...classicFront()].reverse() } }])
    const actor = (await ProjectActor.load('p', store))!
    expect(art(actor.doc)).toMatchObject({ radiusMm: 2.3 })
  })

  it('leaves a picture the designer moved square, in the store and in the log', async () => {
    const moved = storedBefore1224()
    moved.template.faces['front']!.base = classicFront().map((e) => (e.kind === 'image' ? { ...e, x: 6 } : e))
    const store = new MemoryProjectStore()
    await store.create('p', moved)
    expect(art(await store.load('p'))).not.toHaveProperty('radiusMm')
    await store.appendEdits('p', [{ seq: 1, at: '2026-10-01T10:00:00.000Z', intent: { v: 'rename', name: 'Västern II' } }])
    expect(art((await ProjectActor.load('p', store))!.doc)).not.toHaveProperty('radiusMm')
  })
})

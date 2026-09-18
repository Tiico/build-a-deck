import { describe, expect, it } from 'vitest'
import { MemoryProjectStore, ProjectDoc } from '../src/projects.js'
import { twoSeatSetup } from './fixture.js'

// A project written before `anchor` was retired (#221, L22, beslut 3), read by a tool that no
// longer has one. The schema refuses the old shape, so a stored document has to be lifted out of
// it — and the store is where a stored document becomes a live one, for the editor, for the
// table's textures and for the print PDF alike.
//
// It is lifted on the way out rather than rewritten in the database on purpose: a project's
// history is written once and never rewritten (B4), so every version has to go on reading, and a
// migration that only touched the newest row would leave the rest of the history unopenable.

const storedBeforeTheRetirement = () => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template: {
      faces: {
        front: {
          base: [
            { kind: 'group', id: 'inner', x: 0, y: 0, children: [{ kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, frame: { fill: 0.8, anchor: 'foot' } }] },
          ],
          variants: { rare: { override: [{ kind: 'image', id: 'art', x: 5, y: 4, w: 40, h: 30, bind: { field: 'art' }, frame: { fill: 0.6, anchor: 'centre' } }] } },
        },
      },
    },
    rows: [{ id: 'dragon', fields: { art: 'a.png', antal: 1 } }],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

const framesIn = (doc: ProjectDoc) => {
  const face = doc.template.faces['front']
  const group = face?.base[0]
  const inner = group?.kind === 'group' ? group.children[0] : undefined
  const over = face?.variants['rare']?.override?.[0]
  return [inner?.kind === 'image' ? inner.frame : undefined, over?.kind === 'image' ? over.frame : undefined]
}

describe('a project stored before the anchor was retired (#221)', () => {
  it('is refused by the schema in the shape it was stored in', () => {
    expect(() => ProjectDoc.parse(storedBeforeTheRetirement())).toThrow()
  })

  it('comes out of the store in today’s shape, everywhere a measure can stand', async () => {
    const store = new MemoryProjectStore()
    await store.create('p', storedBeforeTheRetirement() as unknown as ProjectDoc)

    const rec = await store.load('p')

    expect(rec && framesIn(rec)).toEqual([{ fill: 0.8 }, { fill: 0.6 }])
    expect(() => ProjectDoc.parse(rec)).not.toThrow()
  })

  it('reads the same way out of the history, which is never rewritten', async () => {
    const store = new MemoryProjectStore()
    await store.create('p', storedBeforeTheRetirement() as unknown as ProjectDoc)

    const old = await store.at('p', 1)

    expect(old && framesIn(old)).toEqual([{ fill: 0.8 }, { fill: 0.6 }])
  })
})

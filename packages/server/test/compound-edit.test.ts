import { describe, expect, it } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import { applyEdit, decideEdit, type EditIntent } from '../src/edits.js'
import { ProjectActor } from '../src/project-actor.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'

// The composite edit (#1002, PRD module 5): several edits applied as one — one line in the log, all
// or nothing, one step back. It is how an accepted AI proposal lands, and it is the editor's own
// vocabulary rather than the table's closed intents (D3), so it is no protocol migration.
const doc = (): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }],
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}
const three: EditIntent = {
  v: 'compound',
  edits: [
    { v: 'addRow', cardRef: 'kort-2', fields: { title: 'Varg', antal: 1 } },
    { v: 'addRow', cardRef: 'kort-3', fields: { title: 'Räv', antal: 2 } },
    { v: 'addRow', cardRef: 'kort-4', fields: { title: 'Lo', antal: 1 } },
  ],
}

describe('a composite edit is several edits applied as one', () => {
  it('applies every edit it carries, in order', () => {
    const next = applyEdit(doc(), three)
    expect(next.rows.map((r) => r.id)).toEqual(['dragon', 'kort-2', 'kort-3', 'kort-4'])
    expect(next).toEqual([...(three as Extract<EditIntent, { v: 'compound' }>).edits].reduce(applyEdit, doc()))
  })

  it('is all or nothing: one edit that does not apply refuses the whole', () => {
    const before = doc()
    const broken: EditIntent = { v: 'compound', edits: [{ v: 'addRow', cardRef: 'kort-2', fields: { title: 'Varg' } }, { v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' }] }
    expect(() => applyEdit(before, broken)).toThrow(/ingen/)
    expect(before.rows).toHaveLength(1)
  })

  it('holds no composite inside it, and is never empty', () => {
    expect(() => applyEdit(doc(), { v: 'compound', edits: [three] })).toThrow(/composite/)
    expect(() => applyEdit(doc(), { v: 'compound', edits: [] })).toThrow(/composite/)
  })

  it('decides each edit it carries against the document the ones before it left', () => {
    const asked: EditIntent = {
      v: 'compound',
      edits: [
        { v: 'addZone', id: 'z1', kind: 'pile', name: 'Ett' },
        { v: 'addZone', id: 'z2', kind: 'pile', name: 'Två' },
      ],
    }
    const decided = decideEdit(doc(), asked) as Extract<EditIntent, { v: 'compound' }>
    const [one, two] = decided.edits as Extract<EditIntent, { v: 'addZone' }>[]
    expect(one?.geometry).toBeDefined()
    expect(two?.geometry).toBeDefined()
    // Two piles made in one go do not land on the same spot.
    expect(two?.geometry).not.toEqual(one?.geometry)
  })
})

describe('the actor commits a composite edit as one line', () => {
  it('writes one line, tells everyone once, and replays to the same document', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    const actor = (await ProjectActor.load('p1', store))!
    const told: number[] = []
    actor.subscribe({ id: 'w', name: 'Bo', send: (m) => m.v === 'edits' && told.push(m.edits.length) })
    await actor.edit(three, 'ada')
    expect(await store.readEdits('p1', 0)).toHaveLength(1)
    expect(told).toEqual([1])
    const replayed = (await ProjectActor.load('p1', store))!
    expect(replayed.doc).toEqual(actor.doc)
    expect(replayed.doc.rows).toHaveLength(4)
  })

  it('refuses a composite whose part breaks a rule only the live door asks, and the log does not move', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    const actor = (await ProjectActor.load('p1', store))!
    const clash: EditIntent = { v: 'compound', edits: [{ v: 'addRow', cardRef: 'kort-2', fields: { title: 'Varg' } }, { v: 'addField', field: 'TITLE' }] }
    await expect(actor.edit(clash)).rejects.toThrow(/already exists/)
    expect(await store.readEdits('p1', 0)).toHaveLength(0)
    expect(actor.doc.rows).toHaveLength(1)
  })
})

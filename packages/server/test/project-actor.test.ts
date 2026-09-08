import { describe, expect, it } from 'vitest'
import { MemoryProjectStore } from '../src/index.js'
import { ProjectActor, ProjectHost } from '../src/project-actor.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import type { ProjectDoc } from '../src/projects.js'
import type { EditIntent } from '../src/edits.js'
import type { EditorMessage } from '../src/project-actor.js'

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

// A subscriber that keeps what it was sent, the way an open editor would.
function watcher(id = 'w', name = 'Ada') {
  const seen: { seq: number; intent: EditIntent }[] = []
  const send = (m: EditorMessage) => {
    if (m.v === 'edits') seen.push(...m.edits)
  }
  return { id, name, seen, send }
}

describe('the document the actor hands out', () => {
  it('carries every field the project has, so nothing a project gained later is dropped on the way (B3)', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', { ...doc(), fonts: { Rubrik: { stack: '"Rubrik", serif', asset: `asset:${'a'.repeat(64)}` } } }, 'ada')
    const actor = (await ProjectActor.load('p1', store))!
    let handed: ProjectDoc | null = null
    actor.subscribe({ id: 'w', name: 'Ada', send: (m: EditorMessage) => m.v === 'project' && (handed = m.doc) })
    expect(handed).not.toBeNull()
    expect((handed as unknown as ProjectDoc).fonts?.['Rubrik']?.asset).toBe(`asset:${'a'.repeat(64)}`)

    // And saving what it holds keeps them: a version is what the designer had, not a subset.
    await actor.edit({ v: 'rename', name: 'Skogens herrar II' }, 'ada')
    await actor.save()
    expect((await store.load('p1'))?.fonts?.['Rubrik']?.stack).toBe('"Rubrik", serif')
  })
})

describe('one actor owns one project (D3)', () => {
  it('commits an edit to the log before applying it, and hands the same document to everyone', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc(), 'ada')
    const actor = (await ProjectActor.load('p1', store))!
    const ada = watcher()
    const bo = watcher('b', 'Bo')
    actor.subscribe(ada)
    actor.subscribe(bo)

    await actor.edit({ v: 'setCell', cardRef: 'dragon', field: 'title', value: 'Drakhona' }, 'ada')
    expect(actor.doc.rows[0]?.fields['title']).toBe('Drakhona')
    // Both editors were told, and told the same thing.
    expect(ada.seen.map((e) => e.seq)).toEqual([1])
    expect(bo.seen).toEqual(ada.seen)
    expect((await store.readEdits('p1', 0)).map((e) => e.seq)).toEqual([1])
    expect((await store.readEdits('p1', 0))[0]?.by).toBe('ada')
  })

  it('refuses an edit that makes no sense, and neither the log nor the document moves', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    await expect(actor.edit({ v: 'setCell', cardRef: 'ingen', field: 'title', value: 'x' })).rejects.toThrow(/ingen/)
    expect(await store.readEdits('p1', 0)).toEqual([])
    expect(actor.doc.rows[0]?.fields['title']).toBe('Drake')
  })

  it('is rebuilt from what was saved plus what has happened since, so nothing in memory is the truth', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const first = (await ProjectActor.load('p1', store))!
    await first.edit({ v: 'rename', name: 'Skogens andar' })
    await first.edit({ v: 'setCell', cardRef: 'dragon', field: 'antal', value: 5 })

    const again = (await ProjectActor.load('p1', store))!
    expect(again.doc.name).toBe('Skogens andar')
    expect(again.doc.rows[0]?.fields['antal']).toBe(5)
    expect(again.seq).toBe(2)
  })

  it('makes a version when it is saved, and starts a new tail from there', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    await actor.edit({ v: 'rename', name: 'Skogens andar' })
    expect(await actor.save()).toEqual({ ok: true, rev: 2 })
    expect((await store.load('p1'))?.name).toBe('Skogens andar')
    expect((await store.versions('p1')).map((v) => v.rev)).toEqual([2, 1])

    // What came before is untouched, and a fresh actor starts from the saved version.
    await actor.edit({ v: 'rename', name: 'Efter sparningen' })
    const again = (await ProjectActor.load('p1', store))!
    expect(again.doc.name).toBe('Efter sparningen')
    expect((await store.at('p1', 2))?.name).toBe('Skogens andar')
  })

  it('says who else is here, and stops saying so when they leave', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    const told: string[][] = []
    const ada = {
      id: 'a',
      name: 'Ada',
      send: (m: EditorMessage) => {
        if (m.v === 'here' || m.v === 'project') told.push(m.here.map((p) => p.name))
      },
    }
    const leave = actor.subscribe(ada)
    actor.subscribe({ id: 'b', name: 'Bo', send: () => undefined })
    expect(told.at(-1)).toEqual(['Ada', 'Bo'])
    leave()
    actor.subscribe({ id: 'c', name: 'Cilla', send: () => undefined })
    expect(actor.here.map((p) => p.name)).toEqual(['Bo', 'Cilla'])
  })
})

describe('the host keeps one actor per project (D3)', () => {
  it('hands the same actor to everyone who asks, and nothing for a project that is not there', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const host = new ProjectHost(store)
    const one = await host.get('p1')
    const two = await host.get('p1')
    expect(one).toBe(two)
    expect(await host.get('nope')).toBeNull()
  })
})

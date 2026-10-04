import { describe, expect, it, vi } from 'vitest'
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

  // What is saved is not what is held when the log has a tail nobody saved (#764): an editor
  // that joins is handed both, so «Osparat» is a comparison it can make (L9), and not only the
  // held one, which it would have to take for saved.
  it('hands a joining editor the saved document beside the held one while the tail is unsaved', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    await (await ProjectActor.load('p1', store))!.edit({ v: 'rename', name: 'Osparad svans' })
    const actor = (await ProjectActor.load('p1', store))!
    const handed: EditorMessage[] = []
    actor.subscribe({ id: 'w', name: 'Ada', send: (m: EditorMessage) => handed.push(m) })
    const first = handed.find((m) => m.v === 'project')
    expect(first?.v === 'project' && first.doc.name).toBe('Osparad svans')
    expect(first?.v === 'project' && first.saved?.name).toBe('Skogens herrar')

    // Once saved, the held document is the saved one and nothing beside it is sent.
    await actor.save()
    const later: EditorMessage[] = []
    actor.subscribe({ id: 'b', name: 'Bo', send: (m: EditorMessage) => later.push(m) })
    const second = later.find((m) => m.v === 'project')
    expect(second?.v === 'project' && second.saved).toBeUndefined()
  })

  // A whole document written over HTTP is a version like any other (#768): it says how far the
  // log had come, so a fresh actor does not replay the tail before it over the top of it.
  it('makes a whole document written to it a version that a fresh actor starts from', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    await actor.edit({ v: 'rename', name: 'Osparad svans' })
    expect(await actor.put(1, { ...doc(), name: 'Skrivet över HTTP' })).toEqual({ ok: true, rev: 2 })
    expect(actor.doc.name).toBe('Skrivet över HTTP')
    expect(await actor.put(1, doc())).toEqual({ ok: false, reason: 'conflict' })

    const again = (await ProjectActor.load('p1', store))!
    expect(again.doc.name).toBe('Skrivet över HTTP')
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

// The log is the truth and it must always replay identically (CLAUDE.md, DRIFT §7). A verb whose
// validity changed under an already-written log is therefore the log's problem, not the verb's:
// `patchElement` accepted an id the face did not have until #41, so entries like this one sit in
// the tail of every project saved before that change.
describe('a log written before the rules changed still opens (#41, DRIFT §7)', () => {
  const gone: EditIntent = { v: 'patchElement', face: 'front', id: 'borta', patch: { x: 9 } }

  it('replays past an edit that is no longer legal, keeps the rest of the log, and says so where an operator can see it', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    await store.appendEdits('p1', [
      { seq: 1, at: '2026-09-01T10:00:00.000Z', intent: { v: 'rename', name: 'Skogens andar' } },
      { seq: 2, at: '2026-09-01T10:01:00.000Z', intent: gone },
      { seq: 3, at: '2026-09-01T10:02:00.000Z', intent: { v: 'setCell', cardRef: 'dragon', field: 'antal', value: 5 } },
    ])
    const said: string[] = []
    const quiet = vi.spyOn(console, 'error').mockImplementation((line: string) => void said.push(line))

    const actor = (await ProjectActor.load('p1', store))!
    expect(actor.doc.name).toBe('Skogens andar')
    expect(actor.doc.rows[0]?.fields['antal']).toBe(5)
    expect(actor.seq).toBe(3)

    // Only container logs exist (DRIFT §8), so the skipped line is named on stderr, with the seq a
    // bug report would carry.
    expect(said.map((l) => JSON.parse(l) as unknown)).toEqual([
      { msg: 'edit-skipped', project: 'p1', seq: 2, intent: 'patchElement', error: expect.stringContaining('borta') },
    ])
    quiet.mockRestore()

    // And the tolerance is the log's alone: the same intent arriving live is still refused (#41).
    await expect(actor.edit(gone)).rejects.toThrow(/borta/)
  })
})

// A column whose name differs from another only in its capitals is one the CSV import folds into
// the other (#479), so the actor no longer lets one be made (#694). That is a rule about what may
// be made now, not about what a log already says: a deck that got `typ` and `TYP` before the rule
// keeps both, line for line, and replays without a single skipped entry.
describe('a column name that differs only in its capitals (#694)', () => {
  const before = [
    { seq: 1, at: '2026-10-01T10:00:00.000Z', intent: { v: 'addField', field: 'typ' } },
    { seq: 2, at: '2026-10-01T10:01:00.000Z', intent: { v: 'addField', field: 'TYP' } },
    { seq: 3, at: '2026-10-01T10:02:00.000Z', intent: { v: 'addField', field: 'kraft' } },
    { seq: 4, at: '2026-10-01T10:03:00.000Z', intent: { v: 'renameField', from: 'kraft', to: 'Typ' } },
  ] satisfies { seq: number; at: string; intent: EditIntent }[]

  it('still replays from a log written before the rule, identically and with nothing skipped', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    await store.appendEdits('p1', before)
    const said: string[] = []
    const quiet = vi.spyOn(console, 'error').mockImplementation((line: string) => void said.push(line))
    const actor = (await ProjectActor.load('p1', store))!
    quiet.mockRestore()

    expect(said).toEqual([])
    expect(Object.keys(actor.doc.rows[0]!.fields)).toEqual(['title', 'antal', 'typ', 'TYP', 'Typ'])
    expect(actor.seq).toBe(4)
  })

  it('refuses one arriving live, made or renamed onto, against a column, `id` or `antal`', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const actor = (await ProjectActor.load('p1', store))!
    await actor.edit({ v: 'addField', field: 'typ' })
    await actor.edit({ v: 'addField', field: 'kraft' })

    await expect(actor.edit({ v: 'addField', field: 'TYP' })).rejects.toThrow(/typ/)
    await expect(actor.edit({ v: 'addField', field: 'Title' })).rejects.toThrow(/title/)
    await expect(actor.edit({ v: 'addField', field: 'ID' })).rejects.toThrow(/id/)
    await expect(actor.edit({ v: 'addField', field: 'Antal' })).rejects.toThrow(/antal/)
    await expect(actor.edit({ v: 'renameField', from: 'kraft', to: 'Typ' })).rejects.toThrow(/typ/)
    await expect(actor.edit({ v: 'renameField', from: 'kraft', to: 'ANTAL' })).rejects.toThrow(/antal/)
    expect(actor.seq).toBe(2)

    // A column's own name in other capitals is the same column, and is a rename like any other.
    await actor.edit({ v: 'renameField', from: 'kraft', to: 'Kraft' })
    expect(Object.keys(actor.doc.rows[0]!.fields)).toEqual(['title', 'antal', 'typ', 'Kraft'])
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

  // A load that fell over is not an answer about the project, and it must not become one: the
  // host held the rejected promise and handed the same failure to everyone who asked afterwards,
  // so one unreachable moment closed the project for the life of the process.
  it('keeps nothing from a load that failed, so the project opens on the next ask', async () => {
    const store = new MemoryProjectStore()
    await store.create('p1', doc())
    const host = new ProjectHost(store)
    const stumble = vi.spyOn(store, 'readEdits').mockRejectedValueOnce(new Error('the log was unreachable'))

    await expect(host.get('p1')).rejects.toThrow(/unreachable/)
    expect(stumble).toHaveBeenCalledTimes(1)

    // The store is itself again, so the next ask is a fresh load and not the failure kept.
    const actor = await host.get('p1')
    expect(actor?.doc.name).toBe('Skogens herrar')
    expect(await host.get('p1')).toBe(actor)
  })
})

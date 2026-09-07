import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ProjectClient } from '../src/editor/ProjectClient.js'
import { projectDoc } from './project-doc.js'
import { startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('ProjectClient', () => {
  it('loads a project, edits rows and template locally, saves with its revision, and surfaces a stale save as a conflict', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(client.doc.name).toBe('Skogens herrar')
    expect(client.rev).toBe(1)
    expect(client.dirty).toBe(false)

    client.setCell('dragon', 'title', 'Drakhona')
    client.patchElement('front', 'title', { font: { family: 'sans-serif', sizePt: 16, weight: 700 } })
    expect(client.dirty).toBe(true)
    expect(client.doc.rows.find((r) => r.id === 'dragon')?.fields['title']).toBe('Drakhona')

    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect(client.dirty).toBe(false)
    const stored = await run.projects.load('p1')
    expect(stored?.rev).toBe(2)
    expect(stored?.template.faces['front']?.base.find((e) => e.id === 'title')).toMatchObject({ font: { sizePt: 16 } })

    // Someone else saved in the meantime.
    await run.projects.replace('p1', 2, { ...projectDoc(), name: 'Ändrad av annan' })
    client.setCell('knight', 'antal', '3')
    expect(await client.save()).toEqual({ ok: false, reason: 'conflict' })
    expect(client.dirty).toBe(true)
  })

  it('starts a table from the saved project and returns the session id', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    const session = await client.startTable()
    expect(session.id).toMatch(/[0-9a-f-]{36}/)
    expect(session.version).toBe('rev-1')
    expect((await run.store.loadSession(session.id))?.setup.components).toHaveLength(4)
  })
})

describe('refreshing a running table (C7, L5)', () => {
  it('saves unsaved edits, then pushes the current rev to the table as version.change', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    const session = await client.startTable()
    client.setCell('dragon', 'antal', 5)
    const result = await client.refreshTable(session.id)
    expect(result).toEqual({ version: 'rev-2', seqs: [1] })
    expect(client.dirty).toBe(false)
    const log = await run.store.read(session.id)
    expect(log.map((l) => l.intent.v)).toEqual(['version.change'])
  })
})

describe('editing the template on the canvas (#18)', () => {
  const ids = (client: ProjectClient) => client.doc.template.faces['front']!.base.map((e) => e.id)
  const added = { kind: 'shape', id: 'shape-1', x: 1, y: 1, w: 5, h: 5, shape: 'rect' } as const

  it('adds an element on top, takes one away, and moves one in the stack — all through the one write path', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(ids(client)).toEqual(['frame', 'title', 'body'])

    // A new element is drawn over the ones already there.
    client.addElement('front', added)
    expect(ids(client)).toEqual(['frame', 'title', 'body', 'shape-1'])
    expect(client.dirty).toBe(true)

    // The order in the base list is the drawing order; moving a layer moves it there.
    client.moveElement('front', 'shape-1', 1)
    expect(ids(client)).toEqual(['frame', 'shape-1', 'title', 'body'])
    client.moveElement('front', 'frame', 3)
    expect(ids(client)).toEqual(['shape-1', 'title', 'body', 'frame'])

    client.removeElement('front', 'title')
    expect(ids(client)).toEqual(['shape-1', 'body', 'frame'])

    // The change is the project's, so it saves and reloads like any other.
    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    expect((await run.projects.load('p1'))?.template.faces['front']?.base.map((e) => e.id)).toEqual(['shape-1', 'body', 'frame'])
  })

  it('refuses an element whose id is already on the face, and a face that does not exist', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(() => client.addElement('front', { ...added, id: 'title' })).toThrow(/title/)
    expect(() => client.addElement('sida', added)).toThrow(/sida/)
    expect(client.dirty).toBe(false)
  })
})

describe('the tables a project has (#19)', () => {
  it('lists them newest first, with the version each runs and whether it has ended', async () => {
    const created = await run.projects.create('p1', projectDoc())
    const client = await ProjectClient.open({ http: run.http, id: created.id })
    expect(await client.tables()).toEqual([])

    const older = await client.startTable()
    const newer = await client.startTable()
    expect(await client.tables()).toEqual([
      { id: newer.id, version: 'rev-1', ended: false, lastAt: null },
      { id: older.id, version: 'rev-1', ended: false, lastAt: null },
    ])
  })
})

// A group is a rule on a column (#13): the column is the faces' `variantBy`, the value is the
// variant's key, and what the designer changes with a group open becomes that group's override
// on that face. The base is never touched by it, and no card is ever named.
describe('grouping cards and letting the group rule a face (#13)', () => {
  const front = (client: ProjectClient) => client.doc.template.faces['front']!
  const back = (client: ProjectClient) => client.doc.template.faces['back']!
  const open = async () => {
    const created = await run.projects.create('p1', projectDoc())
    return ProjectClient.open({ http: run.http, id: created.id })
  }

  it('groups the whole deck by one column, on every face, and ungroups it again', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    expect(front(client).variantBy).toBe('typ')
    expect(back(client).variantBy).toBe('typ')
    expect(client.dirty).toBe(true)

    client.setGroupColumn(null)
    expect(front(client).variantBy).toBeUndefined()
    expect(back(client).variantBy).toBeUndefined()
  })

  it('turns an edit made with a group open into that group’s override, leaving the base alone', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('front', 'title', { x: 9 }, 'fälla')

    expect(front(client).base.find((e) => e.id === 'title')).toMatchObject({ x: 5 })
    expect(front(client).variants['fälla']?.override).toMatchObject([{ id: 'title', x: 9 }])

    // A second edit sharpens the same override rather than making a second one.
    client.patchElement('front', 'title', { y: 12 }, 'fälla')
    expect(front(client).variants['fälla']?.override).toMatchObject([{ id: 'title', x: 9, y: 12 }])
  })

  it('gives the group a back of its own without disturbing the base’s back', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('back', 'bg', { fill: '#3a1c1c' }, 'fälla')
    expect(back(client).base).toMatchObject([{ id: 'bg', fill: '#2f4068' }])
    expect(back(client).variants['fälla']?.override).toMatchObject([{ id: 'bg', fill: '#3a1c1c' }])
  })

  it('adds an element for the group only, and takes a base element away for the group only', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    const stamp = { kind: 'shape', id: 'stamp', x: 40, y: 70, w: 10, h: 10, shape: 'circle' } as const

    client.addElement('front', stamp, 'fälla')
    expect(front(client).base.map((e) => e.id)).toEqual(['frame', 'title', 'body'])
    expect(front(client).variants['fälla']?.override?.map((e) => e.id)).toEqual(['stamp'])

    client.removeElement('front', 'body', 'fälla')
    expect(front(client).base.map((e) => e.id)).toEqual(['frame', 'title', 'body'])
    expect(front(client).variants['fälla']?.remove).toEqual(['body'])

    // Taking away what the group itself added is not a removal against the base: it just goes.
    client.removeElement('front', 'stamp', 'fälla')
    expect(front(client).variants['fälla']?.override).toEqual([])
    expect(front(client).variants['fälla']?.remove).toEqual(['body'])
  })

  it('lets a layer fall back to the base, which is how a group stops overriding it', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('front', 'title', { x: 9 }, 'fälla')
    client.removeElement('front', 'body', 'fälla')

    client.resetElement('front', 'title', 'fälla')
    client.resetElement('front', 'body', 'fälla')
    expect(front(client).variants['fälla']?.override).toEqual([])
    expect(front(client).variants['fälla']?.remove).toEqual([])
  })

  it('saves and reloads the group as part of the project, like every other template change', async () => {
    const client = await open()
    client.setGroupColumn('typ')
    client.patchElement('front', 'title', { color: '#e74c3c' }, 'fälla')
    expect(await client.save()).toEqual({ ok: true, rev: 2 })
    const stored = await run.projects.load('p1')
    expect(stored?.template.faces['front']?.variantBy).toBe('typ')
    expect(stored?.template.faces['front']?.variants['fälla']?.override).toMatchObject([{ id: 'title', color: '#e74c3c' }])
  })
})

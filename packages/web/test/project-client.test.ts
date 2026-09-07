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

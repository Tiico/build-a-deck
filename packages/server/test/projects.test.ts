import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WireClient } from './client.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

let run: Running
beforeEach(async () => {
  run = await start()
})
afterEach(async () => {
  await run.stop()
})

const json = (method: string, path: string, body?: unknown) =>
  fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? null : JSON.stringify(body) })

function project() {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: {
      dragon: { title: 'Drake', antal: 3 },
      knight: { title: 'Riddare', antal: 1 },
      wizard: { title: 'Trollkarl' },
    },
    icons: {},
    setup: { zones, seats, floor, deckZone: 'draw' },
  }
}

describe('projects (L4, L5)', () => {
  it('creates, reads and replaces a project, with a revision that moves on every write', async () => {
    const created = await json('POST', '/projects', project())
    expect(created.status).toBe(201)
    const { id, rev } = (await created.json()) as { id: string; rev: number }
    expect(rev).toBe(1)

    const read = await json('GET', `/projects/${id}`)
    expect(read.status).toBe(200)
    const doc = (await read.json()) as { name: string; rev: number; rows: Record<string, unknown> }
    expect(doc.name).toBe('Skogens herrar')
    expect(Object.keys(doc.rows)).toEqual(['dragon', 'knight', 'wizard'])

    const replaced = await json('PUT', `/projects/${id}`, { ...project(), name: 'Skogens herrar v2', rev: 1 })
    expect(replaced.status).toBe(200)
    expect(((await replaced.json()) as { rev: number }).rev).toBe(2)

    const stale = await json('PUT', `/projects/${id}`, { ...project(), rev: 1 })
    expect(stale.status).toBe(409)
    expect((await json('GET', '/projects/nope')).status).toBe(404)
  })

  it('starts a table from a project: antal becomes copies in the deck zone, and textures are queued', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const started = await json('POST', `/projects/${id}/sessions`, {})
    expect(started.status).toBe(201)
    const { id: sessionId } = (await started.json()) as { id: string }

    const table = await WireClient.connect(run.base, sessionId, null)
    expect(table.view?.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'count', count: 5 })
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 5 })
    await table.synced(1)
    const refs = table.view!.components.map((c) => c.cardRef)
    expect(refs).toEqual([null, null, null, null, null])
    expect(table.view!.components.every((c) => c.faces?.['back'])).toBe(true)
    await table.close()

    const log = await run.store.read(sessionId)
    expect(log).toHaveLength(1)
    const session = await run.store.loadSession(sessionId)
    expect(session?.setup.components.map((c) => c.cardRef).sort()).toEqual(['dragon', 'dragon', 'dragon', 'knight', 'wizard'])
    expect(session?.version).toMatch(/^rev-1$/)
  })
})

describe('cross-origin (the editor is served from another origin in development)', () => {
  it('answers preflights and marks JSON responses as readable from any origin', async () => {
    const preflight = await fetch(`${run.http}/projects/x`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('*')
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/PUT/)
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/content-type/i)
    const res = await json('GET', '/health')
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})

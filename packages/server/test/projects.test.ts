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

// Projects belong to accounts (G1): every test here works as one logged-in creator.
let cookie = ''
beforeEach(async () => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
  cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
})
const json = (method: string, path: string, body?: unknown) =>
  fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

function project() {
  const { zones, seats, floor } = twoSeatSetup()
  return {
    name: 'Skogens herrar',
    template,
    rows: [
      { id: 'dragon', fields: { title: 'Drake', antal: 3 } },
      { id: 'knight', fields: { title: 'Riddare', antal: 1 } },
      { id: 'wizard', fields: { title: 'Trollkarl' } },
    ],
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
    const doc = (await read.json()) as { name: string; rev: number; rows: { id: string }[] }
    expect(doc.name).toBe('Skogens herrar')
    expect(doc.rows.map((r) => r.id)).toEqual(['dragon', 'knight', 'wizard'])

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
  it('answers preflights, echoes the origin so the cookie may ride along, and stays open without one', async () => {
    const preflight = await fetch(`${run.http}/projects/x`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    expect(preflight.headers.get('access-control-allow-methods')).toMatch(/PUT/)
    expect(preflight.headers.get('access-control-allow-headers')).toMatch(/content-type/i)
    const res = await fetch(`${run.http}/health`, { headers: { origin: 'http://localhost:5173' } })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
  })
})

describe('refreshing a running table from its project (C7, L5)', () => {
  it('applies the project\'s current rev as version.change: new copies in the deck, textures queued, cards on the table untouched', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    const table = await WireClient.connect(run.base, sessionId, null)
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    await table.synced(1)
    const onTable = table.view!.components[0]!.id

    // The designer adds a card and a copy, then pushes to the table.
    const next = project()
    next.rows.push({ id: 'phoenix', fields: { title: 'Fenix', antal: 1 } })
    next.rows[1] = { id: 'knight', fields: { title: 'Riddare', antal: 2 } }
    expect((await json('PUT', `/projects/${id}`, { ...next, rev: 1 })).status).toBe(200)
    const refreshed = await json('POST', `/sessions/${sessionId}/refresh`, {})
    expect(refreshed.status).toBe(200)
    expect(await refreshed.json()).toEqual({ version: 'rev-2', seqs: [2] })

    await table.synced(2)
    expect(table.view!.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'count', count: 6 })
    expect(table.view!.components.find((c) => c.id === onTable)).toMatchObject({ zone: 'table' })
    const activity = table.messages.find((m) => m.t === 'activity' && m.lines.some((l) => l.intent.v === 'version.change'))
    expect(activity).toBeDefined()

    // The new card has a texture queued under its own hash.
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 6 })
    await table.synced(3)
    const phoenix = table.view!.components.find((c) => c.zone === 'table' && c.faces?.['back'] && c !== undefined)
    expect(phoenix).toBeDefined()
    const hashes = new Set(table.view!.components.flatMap((c) => Object.values(c.faces ?? {})))
    let queued = 0
    for (const h of hashes) if ((await run.renders.status(h))?.state === 'queued') queued++
    expect(queued).toBeGreaterThan(0)
    await table.close()
  })

  it('refuses to refresh a session that was not started from a project', async () => {
    await run.store.createSession({ id: 'loose', version: 'v1', setup: twoSeatSetup() })
    expect((await json('POST', '/sessions/loose/refresh', {})).status).toBe(409)
    expect((await json('POST', '/sessions/nope/refresh', {})).status).toBe(404)
  })
})

describe('texture readiness (L5)', () => {
  it('reports how many of a table\'s textures are rendered, so the editor can wait before opening it', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    const before = await (await fetch(`${run.http}/sessions/${sessionId}/textures`)).json()
    // Three cards, two faces each: the back is one shared texture, the fronts are three.
    expect(before).toEqual({ total: 4, done: 0, failed: [] })
    await run.renderAll()
    const after = await (await fetch(`${run.http}/sessions/${sessionId}/textures`)).json()
    expect(after).toEqual({ total: 4, done: 4, failed: [] })
    expect((await fetch(`${run.http}/sessions/nope/textures`)).status).toBe(404)
  }, 60_000)
})

describe('a version change is atomic for the players (L5)', () => {
  it('prepare queues the next rev\'s textures without touching the table; refresh after that swaps everything at once', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    await run.renderAll()
    const table = await WireClient.connect(run.base, sessionId, null)
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 1 }, { v: 'flip', component: 'c0', face: 'front' })
    await table.synced(2)
    const before = table.view!.components[0]!.faces!['front']

    const rec = (await (await json('GET', `/projects/${id}`)).json()) as { rev: number; rows: { id: string; fields: Record<string, unknown> }[] }
    const rows = rec.rows.map((r) => (r.id === 'dragon' ? { ...r, fields: { ...r.fields, title: 'Drakhona' } } : r))
    expect((await json('PUT', `/projects/${id}`, { ...project(), rows, rev: rec.rev })).status).toBe(200)

    const prepared = (await (await json('POST', `/sessions/${sessionId}/prepare`, {})).json()) as { total: number; done: number; failed: string[] }
    // One new front (the dragon's); the other three textures are already rendered.
    expect(prepared).toEqual({ total: 4, done: 3, failed: [] })
    expect(table.view!.components[0]!.faces!['front']).toBe(before)
    expect(table.view!.seq).toBe(2)

    await run.renderAll()
    expect(await (await json('POST', `/sessions/${sessionId}/prepare`, {})).json()).toEqual({ total: 4, done: 4, failed: [] })
    expect((await json('POST', `/sessions/${sessionId}/refresh`, {})).status).toBe(200)
    await table.synced(3)
    expect(table.view!.components[0]!.faces!['front']).not.toBe(before)
    expect((await fetch(`${run.http}/faces/${table.view!.components[0]!.faces!['front']}`)).status).toBe(200)
    await table.close()
  }, 90_000)
})

describe('the survey after a session (G3)', () => {
  it('accepts one structured answer per participant once the session has ended, tied to its version, and lists them', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId, version } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; version: string }
    const answer = { who: 'Ada', seat: 'A', answers: { fun: 4, clarity: 3, balance: 2, change: 'Draken är för stark' } }
    expect((await json('POST', `/sessions/${sessionId}/survey`, answer)).status).toBe(409)

    const table = await WireClient.connect(run.base, sessionId, null)
    await table.send(null, { v: 'session.end' })
    await table.close()
    expect((await json('POST', `/sessions/${sessionId}/survey`, answer)).status).toBe(201)
    expect((await json('POST', `/sessions/${sessionId}/survey`, { ...answer, answers: { fun: 9 } })).status).toBe(400)
    const listed = (await (await fetch(`${run.http}/sessions/${sessionId}/surveys`)).json()) as unknown[]
    expect(listed).toEqual([expect.objectContaining({ ...answer, version })])
  })
})

describe('a session record (C9)', () => {
  it('GET /sessions/:id says which version it runs and whether it has ended', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    expect(await (await fetch(`${run.http}/sessions/${sessionId}`)).json()).toEqual({ id: sessionId, version: 'rev-1', ended: false, project: id })
    const table = await WireClient.connect(run.base, sessionId, null)
    await table.send(null, { v: 'session.end' })
    await table.close()
    expect(await (await fetch(`${run.http}/sessions/${sessionId}`)).json()).toMatchObject({ ended: true })
    expect((await fetch(`${run.http}/sessions/nope`)).status).toBe(404)
  })
})

describe('exporting a session for the replay corpus (DRIFT §7)', () => {
  it('GET /sessions/:id/export hands over version, setup and the whole log, outcomes included, never the deck', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    const table = await WireClient.connect(run.base, sessionId, null)
    await table.send(null, { v: 'shuffle', pile: 'draw' })
    await table.close()
    const exported = (await (await fetch(`${run.http}/sessions/${sessionId}/export`)).json()) as { version: string; setup: unknown; log: { outcome?: unknown }[]; deck?: unknown }
    expect(exported.version).toBe('rev-1')
    expect(exported.log).toHaveLength(1)
    expect(exported.log[0]?.outcome).toMatchObject({ kind: 'shuffle' })
    expect(exported.deck).toBeUndefined()
    expect((await fetch(`${run.http}/sessions/nope/export`)).status).toBe(404)
  })
})

// A render job that failed for good (#10). Left alone, "Uppdatera bordet" would poll forever:
// `prepare` queued every job again on every call, so a dead job never showed up as dead.
describe('a texture that failed for good (#10)', () => {
  it('prepare keeps reporting the failure, and only an explicit retry puts the job back in the queue', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    const prepare = async (query = '') => (await (await json('POST', `/sessions/${sessionId}/prepare${query}`, {})).json()) as { total: number; done: number; failed: string[] }

    const job = (await run.renders.claim(Date.now()))!
    await run.renders.fail(job.hash, 'chromium gave up')

    expect(await prepare()).toEqual({ total: 4, done: 0, failed: [job.hash] })
    // Asking again is not a retry: a dead job stays dead until someone says otherwise.
    expect(await prepare()).toEqual({ total: 4, done: 0, failed: [job.hash] })
    expect((await run.renders.status(job.hash))?.state).toBe('failed')

    expect(await prepare('?retry=1')).toEqual({ total: 4, done: 0, failed: [] })
    // Back in the queue for real: a worker claims it along with the rest and finishes it.
    const claimed: string[] = []
    for (;;) {
      const next = await run.renders.claim(Date.now())
      if (!next) break
      claimed.push(next.hash)
      await run.renders.complete(next.hash, new Uint8Array([137, 80, 78, 71]))
    }
    expect(claimed).toContain(job.hash)
    expect(await prepare()).toEqual({ total: 4, done: 4, failed: [] })
  })
})

// The editor's Bord tab (#19) needs to know which tables a game has, without keeping a list of
// its own: the tables are the sessions started from the project.
describe('the tables a project has (#19)', () => {
  it('lists them newest first, each with the version it runs, whether it has ended and when it last moved', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const older = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    const newer = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }

    const table = await WireClient.connect(run.base, older.id, null)
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })
    await table.synced(1)
    await table.close()

    const listed = await json('GET', `/projects/${id}/sessions`)
    expect(listed.status).toBe(200)
    const tables = (await listed.json()) as { id: string; version: string; ended: boolean; lastAt: string | null }[]
    expect(tables.map((t) => t.id)).toEqual([newer.id, older.id])
    expect(tables[0]).toMatchObject({ version: 'rev-1', ended: false, lastAt: null })
    expect(tables[1]).toMatchObject({ version: 'rev-1', ended: false })
    expect(Date.parse(tables[1]!.lastAt!)).toBeGreaterThan(0)
  })

  it('says which version a refreshed table runs and which table has ended, and shows nothing of another account\'s game', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    expect((await json('PUT', `/projects/${id}`, { ...project(), name: 'Skogens herrar v2', rev: 1 })).status).toBe(200)
    expect((await json('POST', `/sessions/${sessionId}/refresh`, {})).status).toBe(200)

    const table = await WireClient.connect(run.base, sessionId, null)
    await table.send(null, { v: 'session.end' })
    await table.close()

    const tables = (await (await json('GET', `/projects/${id}/sessions`)).json()) as { version: string; ended: boolean }[]
    expect(tables).toEqual([expect.objectContaining({ version: 'rev-2', ended: true })])

    const stranger = await fetch(`${run.http}/projects/${id}/sessions`)
    expect(stranger.status).toBe(401)
  })
})

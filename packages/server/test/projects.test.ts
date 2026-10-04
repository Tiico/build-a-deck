import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { WireClient } from './client.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'
import { RuleDoc as ServerRuleDoc, type RuleDoc } from '../src/projects.js'
import { RuleDoc as TemplateRuleDoc } from '@byd/template'

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

// A second person, logged in as the first one is: the magic link out of the mailbox (G1).
const login = async (email: string): Promise<string> => {
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
  return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

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

  // A name of 445 characters made the home page's tile sixteen lines tall (#476).
  it('refuses to make or replace a game whose name is longer than 64 characters', async () => {
    expect((await json('POST', '/projects', { ...project(), name: 'x'.repeat(65) })).status).toBe(400)
    const { id } = (await (await json('POST', '/projects', { ...project(), name: 'x'.repeat(64) })).json()) as { id: string }
    expect((await json('PUT', `/projects/${id}`, { ...project(), name: 'x'.repeat(65), rev: 1 })).status).toBe(400)
  })

  it('starts a table from a project: antal becomes copies in the deck zone, and textures are queued', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const started = await json('POST', `/projects/${id}/sessions`, {})
    expect(started.status).toBe(201)
    const { id: sessionId, hostKey } = (await started.json()) as { id: string; hostKey: string }

    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
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
    await run.stop()
    run = await start({ appOrigin: 'http://localhost:5173' })
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
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
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

  // The faces a refreshed table deals are the version it now runs, also after the server has
  // forgotten the table: the session row keeps the deck the table *started* with, because that is
  // where replay begins (#677), so the actor that reloads it must not take its faces from there.
  it('keeps dealing the refreshed version\'s faces after a restart', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }

    const next = project()
    next.rows[0] = { id: 'dragon', fields: { title: 'Drakhona', antal: 3 } }
    next.rows.push({ id: 'phoenix', fields: { title: 'Fenix', antal: 1 } })
    expect((await json('PUT', `/projects/${id}`, { ...next, rev: 1 })).status).toBe(200)
    expect((await json('POST', `/sessions/${sessionId}/refresh`, {})).status).toBe(200)

    // Every card face up on the table, so each one says what it is and which front it shows.
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 6 })
    await table.synced(2)
    await table.send(null, ...table.view!.components.map((c) => ({ v: 'flip' as const, component: c.id, face: 'front' })))
    await table.synced(8)
    await table.close()
    const fronts = async (): Promise<Record<string, string | undefined>> => {
      const looking = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
      const out = Object.fromEntries(looking.view!.components.map((c) => [c.cardRef ?? '?', c.faces?.['front']]))
      await looking.close()
      return out
    }
    const textures = async () => (await (await fetch(`${run.http}/sessions/${sessionId}/textures`)).json()) as { total: number }
    const before = await fronts()
    expect(Object.keys(before).sort()).toEqual(['dragon', 'knight', 'phoenix', 'wizard'])
    expect(Object.values(before).every((h) => h !== undefined)).toBe(true)
    // Four fronts — the dragon's new one and the phoenix among them — and the one shared back.
    expect((await textures()).total).toBe(5)

    await run.restart()
    expect(await fronts()).toEqual(before)
    expect((await textures()).total).toBe(5)
  })

  it('refuses to refresh a session that was not started from a project', async () => {
    await run.store.createSession({ id: 'loose', version: 'v1', setup: twoSeatSetup() })
    expect((await json('POST', '/sessions/loose/refresh', {})).status).toBe(409)
    expect((await json('POST', '/sessions/nope/refresh', {})).status).toBe(404)
  })
})

describe('texture readiness (L5)', () => {
  it('reports how many of a table\'s textures are rendered, so the editor can wait before opening it', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const before = await (await fetch(`${run.http}/sessions/${sessionId}/textures`)).json()
    // Three cards, two faces each: the back is one shared texture, the fronts are three.
    expect(before).toEqual({ total: 4, done: 0, failed: [], smallest: {} })
    await run.renderAll()
    const after = await (await fetch(`${run.http}/sessions/${sessionId}/textures`)).json()
    // And what each card's front was fitted to once it is rendered (#523): the editor says, after a
    // start, which cards a phone cannot read. The template's one text is a 14 pt title.
    expect(after).toEqual({ total: 4, done: 4, failed: [], smallest: { dragon: 14, knight: 14, wizard: 14 } })
    expect((await fetch(`${run.http}/sessions/nope/textures`)).status).toBe(404)
  }, 60_000)
})

describe('a version change is atomic for the players (L5)', () => {
  it('prepare queues the next rev\'s textures without touching the table; refresh after that swaps everything at once', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    await run.renderAll()
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 1 }, { v: 'flip', component: 'c0', face: 'front' })
    await table.synced(2)
    const before = table.view!.components[0]!.faces!['front']

    const rec = (await (await json('GET', `/projects/${id}`)).json()) as { rev: number; rows: { id: string; fields: Record<string, unknown> }[] }
    const rows = rec.rows.map((r) => (r.id === 'dragon' ? { ...r, fields: { ...r.fields, title: 'Drakhona' } } : r))
    expect((await json('PUT', `/projects/${id}`, { ...project(), rows, rev: rec.rev })).status).toBe(200)

    const prepared = (await (await json('POST', `/sessions/${sessionId}/prepare`, {})).json()) as { total: number; done: number; failed: string[] }
    // One new front (the dragon's); the other three textures are already rendered, and only a
    // rendered front says what it was fitted to (#523).
    expect(prepared).toEqual({ total: 4, done: 3, failed: [], smallest: { knight: 14, wizard: 14 } })
    expect(table.view!.components[0]!.faces!['front']).toBe(before)
    expect(table.view!.seq).toBe(2)

    await run.renderAll()
    expect(await (await json('POST', `/sessions/${sessionId}/prepare`, {})).json()).toEqual({ total: 4, done: 4, failed: [], smallest: { dragon: 14, knight: 14, wizard: 14 } })
    expect((await json('POST', `/sessions/${sessionId}/refresh`, {})).status).toBe(200)
    await table.synced(3)
    expect(table.view!.components[0]!.faces!['front']).not.toBe(before)
    expect((await fetch(`${run.http}/faces/${table.view!.components[0]!.faces!['front']}`)).status).toBe(200)
    await table.close()
  }, 90_000)
})

describe('the survey after a session (G3)', () => {
  it('accepts one structured answer per participant once the session has ended, tied to its version, and lists them', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, version, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; version: string; hostKey: string }
    const answer = { who: 'Ada', seat: 'A', answers: { fun: 4, clarity: 3, balance: 2, change: 'Draken är för stark' } }
    expect((await json('POST', `/sessions/${sessionId}/survey`, answer)).status).toBe(409)

    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'session.end' })
    await table.close()
    expect((await json('POST', `/sessions/${sessionId}/survey`, answer)).status).toBe(201)
    expect((await json('POST', `/sessions/${sessionId}/survey`, { ...answer, answers: { fun: 9 } })).status).toBe(400)
    const listed = (await (await json('GET', `/sessions/${sessionId}/surveys`)).json()) as unknown[]
    expect(listed).toEqual([expect.objectContaining({ ...answer, version })])
  })
})

describe('a session record (C9)', () => {
  it('GET /sessions/:id says which version it runs and whether it has ended', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    expect(await (await fetch(`${run.http}/sessions/${sessionId}`)).json()).toEqual({ id: sessionId, version: 'rev-1', ended: false, project: id, name: 'Skogens herrar' })
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'session.end' })
    await table.close()
    expect(await (await fetch(`${run.http}/sessions/${sessionId}`)).json()).toMatchObject({ ended: true })
    expect((await fetch(`${run.http}/sessions/nope`)).status).toBe(404)
  })
})

describe('exporting a session for the replay corpus (DRIFT §7)', () => {
  it('GET /sessions/:id/export hands over version, setup and the whole log, outcomes included, never the deck', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'shuffle', pile: 'draw' })
    await table.close()
    const exported = (await (await json('GET', `/sessions/${sessionId}/export`)).json()) as { version: string; setup: unknown; log: { outcome?: unknown }[]; deck?: unknown }
    expect(exported.version).toBe('rev-1')
    expect(exported.log).toHaveLength(1)
    expect(exported.log[0]?.outcome).toMatchObject({ kind: 'shuffle' })
    expect(exported.deck).toBeUndefined()
    expect((await json('GET', '/sessions/nope/export')).status).toBe(404)
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

    expect(await prepare()).toEqual({ total: 4, done: 0, failed: [job.hash], smallest: {} })
    // Asking again is not a retry: a dead job stays dead until someone says otherwise.
    expect(await prepare()).toEqual({ total: 4, done: 0, failed: [job.hash], smallest: {} })
    expect((await run.renders.status(job.hash))?.state).toBe('failed')

    expect(await prepare('?retry=1')).toEqual({ total: 4, done: 0, failed: [], smallest: {} })
    // Back in the queue for real: a worker claims it along with the rest and finishes it.
    const claimed: string[] = []
    for (;;) {
      const next = await run.renders.claim(Date.now())
      if (!next) break
      claimed.push(next.hash)
      await run.renders.complete(next.hash, new Uint8Array([137, 80, 78, 71]))
    }
    expect(claimed).toContain(job.hash)
    // Completed by hand with no fit, as every texture rendered before #523 was: nothing to say.
    expect(await prepare()).toEqual({ total: 4, done: 4, failed: [], smallest: {} })
  })
})

// The editor's Bord tab (#19) needs to know which tables a game has, without keeping a list of
// its own: the tables are the sessions started from the project.
describe('the tables a project has (#19)', () => {
  it('lists them newest first, each with the version it runs, whether it has ended and when it last moved', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const older = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const newer = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }

    const table = await WireClient.connect(run.base, older.id, null, undefined, { host: older.hostKey })
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
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    expect((await json('PUT', `/projects/${id}`, { ...project(), name: 'Skogens herrar v2', rev: 1 })).status).toBe(200)
    expect((await json('POST', `/sessions/${sessionId}/refresh`, {})).status).toBe(200)

    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'session.end' })
    await table.close()

    const tables = (await (await json('GET', `/projects/${id}/sessions`)).json()) as { version: string; ended: boolean }[]
    expect(tables).toEqual([expect.objectContaining({ version: 'rev-2', ended: true })])

    const stranger = await fetch(`${run.http}/projects/${id}/sessions`)
    expect(stranger.status).toBe(401)
  })

  it('admits the signed-in project owner as table, player or observer without exposing the host key', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }
    for (const query of ['owner=1', 'seat=A&owner=1', 'role=observer&name=Designern&owner=1']) {
      const ws = new WebSocket(`${run.base}/sessions/${sessionId}?${query}`, { headers: { cookie, origin: 'http://test.local' } })
      expect(await firstMessage(ws)).toMatchObject({ t: 'snapshot' })
      ws.close()
    }

    const stranger = new WebSocket(`${run.base}/sessions/${sessionId}?owner=1`, { headers: { cookie: 'byd_session=nope', origin: 'http://test.local' } })
    expect(await firstMessage(stranger)).toEqual({ t: 'refused', reason: 'the table needs the host key or its owner' })
    stranger.close()

    for (const query of [`seat=Q&owner=1`, `role=observer&name=${'x'.repeat(65)}&owner=1`]) {
      const invalid = new WebSocket(`${run.base}/sessions/${sessionId}?${query}`, { headers: { cookie, origin: 'http://test.local' } })
      expect(await firstMessage(invalid)).toMatchObject({ t: 'refused' })
      invalid.close()
    }

    const foreign = new WebSocket(`${run.base}/sessions/${sessionId}?owner=1`, { headers: { cookie, origin: 'https://foreign.example' } })
    expect(await firstMessage(foreign)).toEqual({ t: 'refused', reason: 'the table needs the host key or its owner' })
    foreign.close()
  })

  // The owner who opens her table's screen without its key (#748) is known by her login: the
  // server already knows who she is, so the address need not say `owner=1` for the table to open.
  // She gets the table's own view — what the host key gives — and nobody else's cookie does.
  it('opens the table view to the signed-in owner without the host key, and to no other account', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }

    const own = new WebSocket(`${run.base}/sessions/${sessionId}`, { headers: { cookie, origin: 'http://test.local' } })
    expect(await firstMessage(own)).toMatchObject({ t: 'snapshot' })
    own.close()

    const other = await login('bo@example.com')
    for (const headers of [{ cookie: other, origin: 'http://test.local' }, { origin: 'http://test.local' }, { cookie, origin: 'https://foreign.example' }]) {
      const shut = new WebSocket(`${run.base}/sessions/${sessionId}`, { headers })
      expect(await firstMessage(shut)).toEqual({ t: 'refused', reason: 'the table needs the host key' })
      shut.close()
    }

    // A key that does not open it is not the last word for whoever may open it anyway.
    const stale = new WebSocket(`${run.base}/sessions/${sessionId}?host=nope`, { headers: { cookie, origin: 'http://test.local' } })
    expect(await firstMessage(stale)).toMatchObject({ t: 'snapshot' })
    stale.close()
  })

  // Every way into a table other than the host key asks `owner=1` (DRIFT §9), and that question
  // has to be answered by the same gate the editor itself uses (D3): the role, not the owner
  // field. Otherwise a game is editable while its own table is shut.
  it('admits owner=1 on a table from a project that belongs to nobody, as the editor\'s own gate does', async () => {
    await run.projects.create('open', project())
    const { id: sessionId } = (await (await fetch(`${run.http}/projects/open/sessions`, { method: 'POST' })).json()) as { id: string }

    const ws = new WebSocket(`${run.base}/sessions/${sessionId}?owner=1`, { headers: { origin: 'http://test.local' } })
    expect(await firstMessage(ws)).toMatchObject({ t: 'snapshot' })
    ws.close()
  })

  // A test leader runs playtests without touching the deck (D3). Starting a table and opening the
  // one you started are the same errand, so the same role has to carry through both.
  it('admits owner=1 for an invited test leader, and refuses a viewer, since owner=1 can take a seat', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const { id: sessionId } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string }

    const invite = async (email: string, role: string): Promise<string> => {
      expect((await json('POST', `/projects/${id}/invites`, { email, role })).status).toBe(201)
      const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
      const theirs = await login(email)
      expect((await fetch(`${run.http}/invites/${token}`, { method: 'POST', headers: { cookie: theirs } })).status).toBe(200)
      return theirs
    }

    const tester = await invite('bo@example.com', 'tester')
    const seated = new WebSocket(`${run.base}/sessions/${sessionId}?owner=1`, { headers: { cookie: tester, origin: 'http://test.local' } })
    expect(await firstMessage(seated)).toMatchObject({ t: 'snapshot' })
    seated.close()

    const viewer = await invite('cee@example.com', 'viewer')
    const looking = new WebSocket(`${run.base}/sessions/${sessionId}?owner=1`, { headers: { cookie: viewer, origin: 'http://test.local' } })
    expect(await firstMessage(looking)).toEqual({ t: 'refused', reason: 'the table needs the host key or its owner' })
    looking.close()
  })

  // The editor's header forgets nothing on a reload (#477): the running table and the code guests
  // join it by come back from the list. The code is admission, so only a role that may start a
  // table is shown it; an ended table has no code to show.
  it('carries the room code of a running table to whoever may start one, and to nobody else', async () => {
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string }
    const ended = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const running = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; code: string }
    const table = await WireClient.connect(run.base, ended.id, null, undefined, { host: ended.hostKey })
    await table.send(null, { v: 'session.end' })
    await table.close()

    const tables = (await (await json('GET', `/projects/${id}/sessions`)).json()) as { id: string; code?: string }[]
    expect(tables).toEqual([expect.objectContaining({ id: running.id, code: running.code }), expect.not.objectContaining({ code: expect.anything() })])

    expect((await json('POST', `/projects/${id}/invites`, { email: 'dee@example.com', role: 'viewer' })).status).toBe(201)
    const token = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const viewer = await login('dee@example.com')
    expect((await fetch(`${run.http}/invites/${token}`, { method: 'POST', headers: { cookie: viewer } })).status).toBe(200)
    const seen = (await (await fetch(`${run.http}/projects/${id}/sessions`, { headers: { cookie: viewer } })).json()) as { code?: string }[]
    expect(seen.map((t) => t.code)).toEqual([undefined, undefined])
  })
})

// The first message a raw connection gets: the snapshot it was admitted to, or the refusal.
function firstMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    ws.once('message', (raw) => resolve(JSON.parse(raw.toString())))
    ws.once('error', reject)
  })
}

// A group is a rule on a column (#13): the template's `variantBy` names the column, the variant's
// key is the value. Nothing here is new to the compiler (L3, L7) — what this proves is that the
// rule reaches the table, where a trap must actually look like a trap on both sides.
describe('a group rules what a card looks like on the table (#13)', () => {
  const groupedProject = () => {
    const base = project()
    const front = template.faces['front']!
    const back = template.faces['back']!
    return {
      ...base,
      template: {
        faces: {
          front: {
            ...front,
            variantBy: 'typ',
            variants: { fälla: { override: [{ kind: 'shape', id: 'paper', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#2b1d1f' }, { kind: 'shape', id: 'frame', x: 3, y: 3, w: 57, h: 82, shape: 'rect', stroke: '#c0392b', strokeMm: 1, radiusMm: 3 }, { kind: 'text', id: 'title', x: 5, y: 5, w: 53, h: 10, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 14, weight: 700 }, color: '#f4ead8' }] } },
          },
          back: {
            ...back,
            variantBy: 'typ',
            variants: { fälla: { override: [{ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#3a1c1c' }] } },
          },
        },
      },
      rows: [
        { id: 'dragon', fields: { typ: 'varelse', title: 'Drake', antal: 1 } },
        { id: 'trap', fields: { typ: 'fälla', title: 'Fallgrop', antal: 1 } },
      ],
    }
  }

  // What a texture's smallest text was fitted to (#523), from the server itself and never through
  // the object store: a link to R2 carries no header a page could read. The hash is the capability,
  // as it is for the picture, and the answer says nothing the picture does not show.
  it('says what a texture’s smallest text was fitted to, once it is rendered', async () => {
    const { id } = (await (await json('POST', '/projects', groupedProject())).json()) as { id: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 2 }, { v: 'flip', component: 'c0', face: 'front' }, { v: 'flip', component: 'c1', face: 'front' })
    await table.synced(3)
    const trap = table.view!.components.find((c) => c.cardRef === 'trap')!.faces!['front']!
    await table.close()

    const fit = (hash: string) => fetch(`${run.http}/faces/${hash}/fit`)
    expect((await fit(trap)).status).toBe(202)
    expect((await fit('0'.repeat(64))).status).toBe(404)
    await run.renderAll()
    const res = await fit(trap)
    expect(res.status).toBe(200)
    // The trap's front has one text on it, its 14 pt title.
    expect(await res.json()).toEqual({ smallestPt: 14 })
    // Read by `fetch` and not by an <img>, so from the page's own origin it needs the API's CORS.
    const cross = await fetch(`${run.http}/faces/${trap}/fit`, { headers: { origin: 'http://elsewhere.test' } })
    expect(cross.headers.get('vary')).toBe('origin')
  }, 90_000)

  it('renders a different texture for each group, on the front and on the back', async () => {
    const { id } = (await (await json('POST', '/projects', groupedProject())).json()) as { id: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 2 }, { v: 'flip', component: 'c0', face: 'front' }, { v: 'flip', component: 'c1', face: 'front' })
    await table.synced(3)

    const seen = Object.fromEntries(table.view!.components.map((c) => [c.cardRef, c.faces!]))
    expect(Object.keys(seen).sort()).toEqual(['dragon', 'trap'])
    // The rule alone made these two cards different, on both sides.
    expect(seen['trap']!['front']).not.toBe(seen['dragon']!['front'])
    expect(seen['trap']!['back']).not.toBe(seen['dragon']!['back'])
    await table.close()

    await run.renderAll()
    const png = async (hash: string) => {
      const res = await fetch(`${run.http}/faces/${hash}`)
      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toBe('image/png')
      return new Uint8Array(await res.arrayBuffer())
    }
    const [trapFront, baseFront, trapBack, baseBack] = await Promise.all([
      png(seen['trap']!['front']!),
      png(seen['dragon']!['front']!),
      png(seen['trap']!['back']!),
      png(seen['dragon']!['back']!),
    ])
    // Different pictures, not just different names for the same one.
    expect(Buffer.from(trapFront!).equals(Buffer.from(baseFront!))).toBe(false)
    expect(Buffer.from(trapBack!).equals(Buffer.from(baseBack!))).toBe(false)
  }, 90_000)

  it('sends a hidden card only its group back, without its row or front hash in the frame', async () => {
    const { id } = (await (await json('POST', '/projects', groupedProject())).json()) as { id: string }
    const { id: sessionId, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; hostKey: string }
    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })

    const beforeDraw = table.frames.length
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
    await table.synced(1)
    const hidden = table.view!.components
    const drawFrames = table.frames.slice(beforeDraw).join('\n')
    expect(hidden).toHaveLength(2)
    expect(hidden.every((card) => card.cardRef === null && Object.keys(card.faces ?? {}).join(',') === 'back')).toBe(true)
    expect(drawFrames).not.toContain('dragon')
    expect(drawFrames).not.toContain('trap')
    expect(drawFrames).not.toContain('"front"')

    // Reveal only after checking the raw frames. The stable opaque id lets the test prove that
    // the back already sent for each hidden component belongs to the row later revealed there.
    const hiddenBack = new Map(hidden.map((card) => [card.id, card.faces!['back']!]))
    await table.send(null, ...hidden.map((card) => ({ v: 'flip' as const, component: card.id, face: 'front' as const })))
    await table.synced(3)
    const revealed = Object.fromEntries(table.view!.components.map((card) => [card.cardRef, card]))
    expect(hiddenBack.get(revealed['trap']!.id)).toBe(revealed['trap']!.faces!['back'])
    expect(hiddenBack.get(revealed['dragon']!.id)).toBe(revealed['dragon']!.faces!['back'])
    expect(revealed['trap']!.faces!['back']).not.toBe(revealed['dragon']!.faces!['back'])
    await table.close()
  })

  it('exports paired print faces from the current project and queues each PDF only once', async () => {
    const { id } = (await (await json('POST', '/projects', groupedProject())).json()) as { id: string }

    const first = await json('POST', `/projects/${id}/print`, {})
    expect(first.status).toBe(202)
    const manifest = (await first.json()) as { project: string; rev: number; cards: { cardRef: string; faces: Record<string, string> }[] }
    expect(manifest.project).toBe(id)
    expect(manifest.rev).toBe(1)
    expect(manifest.cards.map((card) => card.cardRef)).toEqual(['dragon', 'trap'])
    expect(manifest.cards.every((card) => Object.keys(card.faces).sort().join(',') === 'back,front')).toBe(true)
    expect(manifest.cards[0]!.faces.back).not.toBe(manifest.cards[1]!.faces.back)
    expect(JSON.stringify(manifest)).not.toContain('compiled')
    expect(JSON.stringify(manifest)).not.toContain('data-card')

    // Asking for the same revision again returns the same content-addressed manifest and does
    // not make duplicate work for the renderer.
    const again = await json('POST', `/projects/${id}/print`, {})
    expect(again.status).toBe(202)
    expect(await again.json()).toEqual(manifest)
    const jobs = []
    for (;;) {
      const job = await run.renders.claim(Date.now())
      if (!job) break
      jobs.push(job)
    }
    expect(jobs).toHaveLength(4)
    expect(new Set(jobs.map((job) => job.hash)).size).toBe(4)
    expect(jobs.every((job) => job.kind.kind === 'pdf' && job.priority === 'print')).toBe(true)
  })

  it('keeps a project print export private to its owner', async () => {
    const { id } = (await (await json('POST', '/projects', groupedProject())).json()) as { id: string }
    expect((await fetch(`${run.http}/projects/${id}/print`, { method: 'POST' })).status).toBe(401)

    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bo@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const verified = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    const otherCookie = (verified.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    expect((await fetch(`${run.http}/projects/${id}/print`, { method: 'POST', headers: { cookie: otherCookie } })).status).toBe(403)
  })
})

describe('physical validation at the order (E5)', () => {
  const withText = (sizePt: number) => ({
    ...project(),
    template: {
      faces: {
        front: { base: [{ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#ffffff' }, { kind: 'text', id: 'body', x: 6, y: 30, w: 51, h: 40, bind: { field: 'body' }, font: { family: 'system-ui', sizePt }, color: '#111111' }], variants: {} },
        back: { base: [{ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: '#2f4068' }], variants: {} },
      },
    },
  })

  it('refuses a print order while a card would come back unreadable, and says which card and why', async () => {
    expect((await json('POST', '/projects', { id: 'p-small', ...withText(4) })).status).toBe(201)
    const res = await json('POST', '/projects/p-small/print')
    expect(res.status).toBe(422)
    const body = (await res.json()) as { errors: { cardRef: string; face: string; element: string; code: string; values: Record<string, string | number> }[] }
    expect(body.errors.length).toBeGreaterThan(0)
    expect(body.errors[0]).toMatchObject({ face: 'front', element: 'body', code: 'text-too-small' })
    expect(body.errors.map((e) => e.cardRef)).toContain('dragon')
    // What was measured travels; the sentence is written where it is read, in the reader's own
    // language (A4).
    expect(body.errors[0]?.values).toEqual({ sizePt: 4, floor: 6 })
  })

  it('lets an order through when only warnings stand, and says what they were', async () => {
    expect((await json('POST', '/projects', { id: 'p-warn', ...withText(7) })).status).toBe(201)
    const res = await json('POST', '/projects/p-warn/print')
    expect(res.status).toBe(202)
    const body = (await res.json()) as { warnings: { cardRef: string; code: string }[]; cards: unknown[] }
    expect(body.cards.length).toBeGreaterThan(0)
    expect(body.warnings.map((w) => w.code)).toContain('text-too-small')
  })
})

describe('the rulebook in the project (B7)', () => {
  const rules: RuleDoc = {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
      { kind: 'text', id: 't1', text: 'Dra ett kort ur [[zon:draw]] och lägg det i [[zon:discard]].' },
      { kind: 'setup', id: 's1', caption: 'Bordet' },
    ],
  }

  it('is part of the document, so it is versioned with the cards and nothing else is needed', async () => {
    const created = await json('POST', '/projects', { id: 'p-rules', ...project(), rules })
    expect(created.status).toBe(201)
    const stored = await run.projects.load('p-rules')
    expect(stored?.rules).toEqual(rules)

    const changed = { ...project(), rules: { ...rules, blocks: [...rules.blocks, { kind: 'text', id: 't2', text: 'Spelet slutar när [[zon:draw]] är tom.' }] } }
    expect((await json('PUT', '/projects/p-rules', { rev: 1, ...changed })).status).toBe(200)
    // The older version keeps the rules it had.
    expect((await run.projects.at('p-rules', 1))?.rules?.blocks).toHaveLength(3)
    expect((await run.projects.at('p-rules', 2))?.rules?.blocks).toHaveLength(4)
  })

  // One declaration, not two held in step by hand (#183): what validates on the way in is the same
  // schema the renderer's type is inferred from, so a field cannot be added to one side and
  // forgotten on the other.
  it('validates with the very schema the renderer reads', () => {
    expect(ServerRuleDoc).toBe(TemplateRuleDoc)
  })

  it('refuses a rulebook the model does not allow', async () => {
    const bad = { ...project(), rules: { title: 'X', blocks: [{ kind: 'kapitel', id: 'k', text: 'nej' }] } }
    expect((await json('POST', '/projects', { id: 'p-bad', ...bad })).status).toBe(400)
  })

  it('says what the rules\' references stand for right now, from the project itself', async () => {
    const { namesOfProject } = await import('../src/doc.js')
    const doc = { ...project(), rules }
    const names = namesOfProject(doc)
    expect(names.zones['discard']).toBe('Kasthög')
    expect(names.cards['dragon']).toBe('Drake')
    // A card with no title falls back to its id, so a reference is never empty.
    expect(namesOfProject({ ...doc, rows: [{ id: 'namnlöst', fields: {} }] }).cards['namnlöst']).toBe('namnlöst')
  })

  // A counter is the third thing a rule can name (#708), and it is named by an id like the other
  // two, so a rule follows the counter when it is renamed. A counter written before it had an id is
  // known by its name, spelled the way a reference's id may be spelled.
  it('names the counters by their id, and a counter without one by its own name', async () => {
    const { namesOfProject } = await import('../src/doc.js')
    const doc = { ...project(), setup: { ...project().setup, counters: [{ id: 'guld', name: 'Dukater', start: 0 }, { name: 'Liv 2', start: 20 }] } }
    expect(namesOfProject(doc).counters).toEqual({ guld: 'Dukater', 'Liv-2': 'Liv 2' })
  })

  it('keeps a counter’s id through the document, so a reference to it is still standing after a save (#708)', async () => {
    const setup = { ...project().setup, counters: [{ id: 'guld', name: 'Guld', start: 0 }] }
    const { id } = (await (await json('POST', '/projects', { ...project(), setup })).json()) as { id: string }
    const read = (await (await json('GET', `/projects/${id}`)).json()) as { setup: { counters: unknown } }
    expect(read.setup.counters).toEqual([{ id: 'guld', name: 'Guld', start: 0 }])
  })
})

// A picture in the book has to come out the other end as the picture that went in (#173): the
// project document is the only thing that carries it, the schema is the only thing that validates
// it, and what a table reads is what the version it was locked to holds.
describe('a picture survives the road from the document to the table (#173)', () => {
  // A caption is the designer's own line beside the picture, and a second field from the alt text
  // (decided 2026-09-17), so what travels has to be both of them and the picture's own pixels.
  const picture = { kind: 'image' as const, id: 'i1', asset: `asset:${'a'.repeat(64)}`, alt: 'Bordet från ovan', caption: 'Bordet vid tre spelare', px: { w: 1400, h: 800 } }
  const quiet = { kind: 'image' as const, id: 'i2', asset: `asset:${'b'.repeat(64)}`, alt: '', px: { w: 700, h: 400 } }
  const withPictures: RuleDoc = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Uppställning' }, picture, quiet] }

  it('comes back out of the document exactly as it went in, version for version', async () => {
    expect((await json('POST', '/projects', { id: 'p-picture', ...project(), rules: withPictures })).status).toBe(201)
    expect((await run.projects.load('p-picture'))?.rules).toEqual(withPictures)
    // Versioned with the cards (B4): a later version cannot rewrite the picture an older one held.
    expect((await json('PUT', '/projects/p-picture', { rev: 1, ...project(), rules: { ...withPictures, blocks: [withPictures.blocks[0]!] } })).status).toBe(200)
    expect((await run.projects.at('p-picture', 1))?.rules?.blocks).toEqual(withPictures.blocks)
    expect((await run.projects.at('p-picture', 2))?.rules?.blocks).toHaveLength(1)
  })

  it('reaches the table as the same picture, saying the same thing about itself', async () => {
    await json('POST', '/projects', { id: 'p-picture-table', ...project(), rules: withPictures })
    const started = await json('POST', '/projects/p-picture-table/sessions', {})
    const { id } = (await started.json()) as { id: string }
    const body = (await (await fetch(`${run.http}/sessions/${id}/rules`)).json()) as { blocks: unknown[]; text: string }
    // Measured on the way out (#173): the block the table reads is the block that went in, with
    // the millimetres every surface scales worked out against the printed page.
    expect(body.blocks[1]).toMatchObject(picture)
    expect(body.blocks[2]).toMatchObject(quiet)
    // What the picture says about itself is part of the book's text, and so is the caption it says
    // beside itself; a decorative picture with no caption says nothing at all.
    expect(body.text).toBe('Uppställning\nBordet från ovan\nBordet vid tre spelare')
  })

  it('refuses a picture that points out of the project, wherever it is written', async () => {
    const outside = (asset: string) => json('POST', '/projects', { id: `p-out-${asset.length}`, ...project(), rules: { title: 'X', blocks: [{ kind: 'image', id: 'i1', asset, alt: '', px: { w: 700, h: 400 } }] } })
    expect((await outside('https://example.com/bordet.png')).status).toBe(400)
    expect((await outside('data:image/png;base64,AAAA')).status).toBe(400)
  })
})

describe('the rules a table plays by (B7)', () => {
  const rulesDoc: RuleDoc = {
    title: 'Skogens herrar',
    blocks: [
      { kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' },
      { kind: 'text', id: 't1', text: 'Dra ur [[zon:draw]] och lägg i [[zon:discard]].' },
    ],
  }

  it('hands a table its own rules, rendered against the version it was started from', async () => {
    await json('POST', '/projects', { id: 'p-rules-table', ...project(), rules: rulesDoc })
    const started = await json('POST', '/projects/p-rules-table/sessions', {})
    const { id } = (await started.json()) as { id: string }

    const res = await fetch(`${run.http}/sessions/${id}/rules`)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { title: string; blocks: { kind: string }[]; warnings: unknown[]; text: string }
    expect(body.title).toBe('Skogens herrar')
    expect(body.blocks.map((b) => b.kind)).toEqual(['heading', 'text'])
    // References are already resolved: the table reads names, not ids.
    expect(body.text).toContain('Dra ur Draghög och lägg i Kasthög.')
    expect(body.warnings).toEqual([])
  })

  it('keeps the rules the table started with, even after the project moves on', async () => {
    await json('POST', '/projects', { id: 'p-moving', ...project(), rules: rulesDoc })
    const started = await json('POST', '/projects/p-moving/sessions', {})
    const { id } = (await started.json()) as { id: string }

    const later = { ...project(), rules: { ...rulesDoc, blocks: [{ kind: 'text' as const, id: 't1', text: 'Helt andra regler.' }] } }
    expect((await json('PUT', '/projects/p-moving', { rev: 1, ...later })).status).toBe(200)

    const body = (await (await fetch(`${run.http}/sessions/${id}/rules`)).json()) as { text: string }
    expect(body.text).toContain('Dra ur Draghög')
    expect(body.text).not.toContain('Helt andra regler')
  })

  // «Uppdatera» moves the table to the project's current rev (C7), and the book moves with it
  // (#677): the version a table is locked to is the one it now runs, not the one it was started
  // on. The session's start record stays what it was — it is where the log's replay begins.
  it('hands a refreshed table the rules of the version it now runs, and keeps the start record', async () => {
    await json('POST', '/projects', { id: 'p-refreshed', ...project() })
    const started = await json('POST', '/projects/p-refreshed/sessions', {})
    const { id } = (await started.json()) as { id: string }
    expect((await fetch(`${run.http}/sessions/${id}/rules`)).status).toBe(204)

    expect((await json('PUT', '/projects/p-refreshed', { rev: 1, ...project(), rules: rulesDoc })).status).toBe(200)
    expect((await json('POST', `/sessions/${id}/refresh`, {})).status).toBe(200)

    const res = await fetch(`${run.http}/sessions/${id}/rules`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { text: string }).text).toContain('Dra ur Draghög')
    const exported = (await (await json('GET', `/sessions/${id}/export`)).json()) as { version: string }
    expect(exported.version).toBe('rev-1')
  })

  // A table without a rulebook is not a mistake — most tables are that, and every phone at one
  // asks this route on the way in. Answering 404 made every one of them log an error in its
  // console over a game that is working exactly as intended, which is how a real error gets lost
  // (UX-kontroll 2026-09-10). A table that does not exist is a different answer, and stays one.
  it('answers a table with no rulebook with nothing, and an unknown table with an error', async () => {
    await json('POST', '/projects', { id: 'p-none', ...project() })
    const started = await json('POST', '/projects/p-none/sessions', {})
    const { id } = (await started.json()) as { id: string }
    const none = await fetch(`${run.http}/sessions/${id}/rules`)
    expect(none.status).toBe(204)
    expect(await none.text()).toBe('')
    expect((await fetch(`${run.http}/sessions/nope/rules`)).status).toBe(404)
  })
})

// The setup in the players' book (#270, HITL 2026-09-20). The table used to be handed the setup
// block's caption and nothing else, so the book the players read could say that there was a setup
// without saying what it was. The zones travel with the block now, and three things have to hold
// about them: they are the *locked* version's, they are grouped by the zone's own ownership, and
// they are the only thing about the table that travels.
describe('the setup the players are handed (B5, B7, #270)', () => {
  const setupRules: RuleDoc = {
    title: 'Skogens herrar',
    blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Uppställning' }, { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' }],
  }
  type Zones = { id: string; name: string }[]
  type Setup = { kind: string; caption?: string; common: Zones; seats: { id: string; zones: Zones }[] }
  const setupOf = async (id: string): Promise<Setup> => {
    const body = (await (await fetch(`${run.http}/sessions/${id}/rules`)).json()) as { blocks: Setup[] }
    return body.blocks[1]!
  }
  const tableFor = async (id: string, doc: Record<string, unknown>): Promise<string> => {
    await json('POST', '/projects', { id, ...doc })
    const started = await json('POST', `/projects/${id}/sessions`, {})
    return ((await started.json()) as { id: string }).id
  }

  it('groups what stands on the table apart from what belongs to each seat, by the zone’s own owner', async () => {
    const setup = await setupOf(await tableFor('p-setup-book', { ...project(), rules: setupRules }))
    expect(setup.common).toEqual([
      { id: 'draw', name: 'Draghög' },
      { id: 'discard', name: 'Kasthög' },
      { id: 'table', name: 'Spelyta' },
    ])
    // Every seat the table has, in the setup's own order, each with the zones it owns. The two
    // hands are both called `Hand`: which seat they stand at is the metadata's answer and could
    // never have been read out of the name.
    expect(setup.seats).toEqual([
      { id: 'A', zones: [{ id: 'hand:A', name: 'Hand' }] },
      { id: 'B', zones: [{ id: 'hand:B', name: 'Hand' }] },
    ])
  })

  it('draws the version the table was locked to, never the draft the editor has moved on to', async () => {
    const id = await tableFor('p-setup-locked', { ...project(), rules: setupRules })
    const { zones, seats, floor } = twoSeatSetup()
    const later = {
      ...project(),
      rules: setupRules,
      setup: { zones: [...zones.map((z) => (z.id === 'discard' ? { ...z, name: 'Påsen' } : z)), { id: 'marknad', kind: 'area', name: 'Marknaden', visibility: 'all', geometry: { x: 0, y: 0, w: 100, h: 100, rot: 0 } }], seats, floor, deckZone: 'draw' },
    }
    expect((await json('PUT', '/projects/p-setup-locked', { rev: 1, ...later })).status).toBe(200)
    const setup = await setupOf(id)
    expect(setup.common.map((z) => z.name)).toEqual(['Draghög', 'Kasthög', 'Spelyta'])
  })

  // What may not travel, read off the bytes rather than off a screen. A rulebook is handed to
  // everybody at the table and to whoever is only watching, so anything in this response is public
  // to all of them: the zones' names are the book's own words (B5), and the cards that lie in them
  // and where they lie are not (B6, K15).
  it('carries the zones and nothing else about the table', async () => {
    const id = await tableFor('p-setup-quiet', { ...project(), rules: setupRules })
    const raw = await (await fetch(`${run.http}/sessions/${id}/rules`)).text()
    // The cards the deck holds are named nowhere in this book, so nothing of them may be here.
    for (const secret of ['Drake', 'Riddare', 'Trollkarl', 'dragon', 'knight', 'wizard']) expect(raw, `${secret} reached the players' rulebook`).not.toContain(secret)
    // Nor anything else a zone knows about itself: where it lies, who may see into it, what it
    // fills with. A zone in the book is a name and the id the book's own references use.
    for (const field of ['geometry', 'visibility', 'returnTo', 'shortcut', 'fill', 'components']) expect(raw, `${field} reached the players' rulebook`).not.toContain(field)
  })
})

// The whole log and the survey answers are the project's playtest data, not the table's (D3, G3).
// The log carries every hand — each draw's outcome says which cards went where — the guests' own
// names and what was written in a flag, and a session's id is in every player's link. So both are
// read by those the project lets open its tables as host, who may already watch every hand with
// `owner=1` (C8); never by a player, a stranger, or the table screen's host key, which sees only
// what is public.
describe('who may read a session’s log and its surveys (D3, C8)', () => {
  const read = (path: string, headers: Record<string, string> = {}) => fetch(`${run.http}${path}`, { headers })
  const shareWith = async (email: string, role: string): Promise<string> => {
    await json('POST', '/projects/p1/invites', { email, role })
    const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
    const theirs = await login(email)
    await fetch(`${run.http}/invites/${link}`, { method: 'POST', headers: { cookie: theirs } })
    return theirs
  }

  it('hands them to the project’s owner and test leaders, and to nobody else', async () => {
    await json('POST', '/projects', { id: 'p1', ...project() })
    const { id: sessionId, hostKey } = (await (await json('POST', '/projects/p1/sessions', {})).json()) as { id: string; hostKey: string }
    const tester = await shareWith('bo@example.com', 'tester')
    const viewer = await shareWith('cilla@example.com', 'viewer')
    const stranger = await login('dan@example.com')
    for (const path of [`/sessions/${sessionId}/export`, `/sessions/${sessionId}/surveys`]) {
      const at = (status: number) => ({ path, status })
      expect(at((await read(path, { cookie })).status)).toEqual(at(200))
      expect(at((await read(path, { cookie: tester })).status)).toEqual(at(200))
      expect(at((await read(path, { cookie: viewer })).status)).toEqual(at(403))
      expect(at((await read(path, { cookie: stranger })).status)).toEqual(at(403))
      // A player's phone has no account to show, only the link the id travels in.
      expect(at((await read(path)).status)).toEqual(at(401))
      // The table screen's key opens the table, which sees only what is public.
      expect(at((await read(path, { authorization: `Bearer ${hostKey}` })).status)).toEqual(at(403))
    }
  })
})

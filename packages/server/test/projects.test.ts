import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { WireClient } from './client.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'
import type { RuleDoc } from '../src/projects.js'

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
    expect(before).toEqual({ total: 4, done: 0, failed: [] })
    await run.renderAll()
    const after = await (await fetch(`${run.http}/sessions/${sessionId}/textures`)).json()
    expect(after).toEqual({ total: 4, done: 4, failed: [] })
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
    const { id } = (await (await json('POST', '/projects', project())).json()) as { id: string; hostKey: string }
    const { id: sessionId, version, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; version: string; hostKey: string }
    const answer = { who: 'Ada', seat: 'A', answers: { fun: 4, clarity: 3, balance: 2, change: 'Draken är för stark' } }
    expect((await json('POST', `/sessions/${sessionId}/survey`, answer)).status).toBe(409)

    const table = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
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

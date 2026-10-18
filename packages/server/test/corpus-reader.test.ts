import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { PostgresLogStore } from '../src/index.js'
import type { LogStore } from '../src/store.js'
import type { ProjectStore } from '../src/projects.js'
import type { AuthStore } from '../src/auth.js'
import type { Corpus } from '../src/corpus.js'
import { template } from './deck.js'
import { start, twoSeatSetup, type Running } from './fixture.js'

// The replay corpus out of consenting accounts (#1011, DRIFT §7). A beta designer says yes in the
// mail that invites her; the box lists her address in `BYD_CORPUS_ACCOUNTS`, and the operator named
// in `BYD_OPERATOR` may then read the export of every table played in her games — the one thing
// `pnpm --filter @byd/engine corpus` fetches. Not her survey answers, not her game, not anything to
// write with, and nothing of an account that did not say yes.
//
// The door asks who owns the game and what that owner's address is, which on the box is two
// queries against Postgres, so it is asked of both stores.

const url = process.env['DATABASE_URL']
const schema = `test_corpus_${process.pid}_${Date.now()}`
const opened: PostgresLogStore[] = []
afterAll(async () => {
  for (const pg of opened) {
    await pg.dropSchema()
    await pg.close()
  }
})

type Stores = { store?: LogStore; projects?: ProjectStore; auth?: AuthStore }
const backends: [string, () => Promise<Stores>][] = [
  ['memory', async () => ({})],
  ...(url
    ? ([
        [
          'postgres',
          async () => {
            const pg = PostgresLogStore.connect(url, { schema })
            opened.push(pg)
            await pg.migrate()
            return { store: pg, projects: pg.projects(), auth: pg.auth() }
          },
        ],
      ] as [string, () => Promise<Stores>][])
    : []),
]

const CORPUS: Corpus = { operator: 'op@example.com', accounts: ['ada@example.com'] }

const game = (name: string) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe.each(backends)('the operator reads consenting designers’ table exports, and nothing else (%s, #1011)', (_, open) => {
  let run: Running
  afterEach(async () => {
    await run.stop()
  })

  const login = async (email: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  const as = (cookie: string) => (method: string, path: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

  // A game of the owner's own with one table started from it; ids unique per test, since the
  // Postgres schema is shared by every test in the file.
  let n = 0
  const tableOf = async (owner: string): Promise<{ project: string; session: string }> => {
    const project = `p-corpus-${Date.now()}-${n++}`
    const send = as(await login(owner))
    expect((await send('POST', '/projects', { id: project, ...game('Skogens herrar') })).status).toBe(201)
    const created = await send('POST', `/projects/${project}/sessions`, {})
    expect(created.status).toBe(201)
    return { project, session: ((await created.json()) as { id: string }).id }
  }

  it('hands the operator the whole log of a table in a consenting account’s game', async () => {
    run = await start({ ...(await open()), corpus: CORPUS })
    const { session } = await tableOf('ada@example.com')
    const res = await as(await login('op@example.com'))('GET', `/sessions/${session}/export`)
    expect(res.status).toBe(200)
    const exported = (await res.json()) as { id: string; setup: unknown; log: unknown[]; consented?: true }
    expect(exported.id).toBe(session)
    expect(exported.setup).toBeDefined()
    expect(Array.isArray(exported.log)).toBe(true)
    // The corpus script takes only the owner's own tables (#540); this says the table is one it
    // may take anyway, because its owner said yes. The script cannot tell that from a test
    // leader's export of a game that is not theirs, and must not have to guess.
    expect(exported.consented).toBe(true)
  })

  it('says consent only to the operator: the owner’s own export carries no such word', async () => {
    run = await start({ ...(await open()), corpus: CORPUS })
    const { session } = await tableOf('ada@example.com')
    const exported = (await (await as(await login('ada@example.com'))('GET', `/sessions/${session}/export`)).json()) as { consented?: true }
    expect(exported.consented).toBeUndefined()
  })

  it('opens nothing else of hers: not the survey answers, not the game, no way to write', async () => {
    run = await start({ ...(await open()), corpus: CORPUS })
    const { project, session } = await tableOf('ada@example.com')
    const operator = as(await login('op@example.com'))
    const refused = async (method: string, path: string, body?: unknown) => ({ method, path, status: (await operator(method, path, body)).status })
    expect(await refused('GET', `/sessions/${session}/surveys`)).toEqual({ method: 'GET', path: `/sessions/${session}/surveys`, status: 403 })
    expect(await refused('GET', `/projects/${project}`)).toEqual({ method: 'GET', path: `/projects/${project}`, status: 403 })
    expect(await refused('PUT', `/projects/${project}`, { rev: 1, ...game('Kapad') })).toEqual({ method: 'PUT', path: `/projects/${project}`, status: 403 })
    expect(await refused('POST', `/projects/${project}/sessions`, {})).toEqual({ method: 'POST', path: `/projects/${project}/sessions`, status: 403 })
    expect(await refused('POST', `/projects/${project}/invites`, { email: 'op@example.com', role: 'owner' })).toEqual({ method: 'POST', path: `/projects/${project}/invites`, status: 403 })
    // Her game is not among the operator's, and nothing above changed it.
    expect(((await (await operator('GET', '/projects')).json()) as { id: string }[]).map((g) => g.id)).not.toContain(project)
    expect((await run.projects.load(project))?.name).toBe('Skogens herrar')
  })

  it('refuses the operator a table in a game whose owner did not say yes', async () => {
    run = await start({ ...(await open()), corpus: CORPUS })
    const { session } = await tableOf('bo@example.com')
    expect((await as(await login('op@example.com'))('GET', `/sessions/${session}/export`)).status).toBe(403)
  })

  it('changes nothing for anyone else: the owner reads her own, a stranger reads nothing', async () => {
    run = await start({ ...(await open()), corpus: CORPUS })
    const { session } = await tableOf('ada@example.com')
    expect((await as(await login('ada@example.com'))('GET', `/sessions/${session}/export`)).status).toBe(200)
    expect((await as(await login('dan@example.com'))('GET', `/sessions/${session}/export`)).status).toBe(403)
    expect((await fetch(`${run.http}/sessions/${session}/export`)).status).toBe(401)
  })

  it('is a stranger like any other when the box names no corpus', async () => {
    run = await start(await open())
    const { session } = await tableOf('ada@example.com')
    expect((await as(await login('op@example.com'))('GET', `/sessions/${session}/export`)).status).toBe(403)
  })
})

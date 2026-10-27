import { afterAll, afterEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { MemoryAuthStore, PostgresLogStore } from '../src/index.js'
import type { LogStore } from '../src/store.js'
import type { ProjectStore } from '../src/projects.js'
import type { AuthStore } from '../src/auth.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { deck, template } from './deck.js'

// Ett bord bärs av ett konto (A2, #1194): bäraren är den som bordets kostnad räknas mot, och en
// dörr som öppnar ett bord utan att någon bär det gör varje tak på bord och renderingar
// verkningslöst. Bäraren står i lagret, så det prövas mot båda: minnet och Postgres.

const url = process.env['DATABASE_URL']
const schema = `test_bearer_${process.pid}_${Date.now()}`
const opened: PostgresLogStore[] = []
afterAll(async () => {
  for (const pg of opened) {
    await pg.dropSchema()
    await pg.close()
  }
})

type Stores = { store?: LogStore; projects?: ProjectStore; auth: AuthStore }
const backends: [string, () => Promise<Stores>][] = [
  ['minnet', async () => ({ auth: new MemoryAuthStore() })],
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

const game = (name: string) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

describe.each(backends)('ett bord bärs av ett konto (%s, #1194)', (_, open) => {
  let run: Running
  let auth: AuthStore
  afterEach(async () => {
    await run.stop()
  })
  const boot = async () => {
    const stores = await open()
    auth = stores.auth
    run = await start(stores)
  }

  // Ids unika per test, eftersom Postgres-schemat delas av varje test i filen.
  let n = 0
  const unique = (what: string) => `${what}-${Date.now()}-${n++}`

  const login = async (email: string): Promise<string> => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
    return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  }
  const as = (cookie: string | null) => (method: string, path: string, body?: unknown) =>
    fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? null : JSON.stringify(body) })
  const accountId = async (email: string) => (await auth.ensureAccount(email)).id

  it('den råa dörren öppnar inget bord utan inloggat konto: ingen session, inget bord, inget renderjobb', async () => {
    await boot()
    const id = unique('anonym')
    const res = await as(null)('POST', '/sessions', { id, version: 'v1', setup: twoSeatSetup(), deck })
    expect(res.status).toBe(401)
    expect(await run.store.loadSession(id)).toBeNull()
    expect(await run.host.loaded()).toEqual([])
    expect(await run.renders.claim(Date.now())).toBeNull()
  })

  it('den råa dörren öppnar bordet som förut med en kaka, och det kontot bär det', async () => {
    await boot()
    const id = unique('med-kaka')
    const res = await as(await login('ada@example.com'))('POST', '/sessions', { id, version: 'v1', setup: twoSeatSetup(), deck })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ id, code: expect.any(String), hostKey: expect.any(String) })
    expect((await run.store.loadSession(id))?.accountId).toBe(await accountId('ada@example.com'))
    // Texturerna köas som förut: kakan ändrar vem som bär bordet, inte vad bordet är.
    expect(await run.renders.claim(Date.now())).not.toBeNull()
  })

  it('ett bord som en testledare startar ur ett spel bärs av spelets ägare, också sedan spelet tagits bort', async () => {
    await boot()
    const owner = as(await login('ada@example.com'))
    const project = unique('p-bearer')
    expect((await owner('POST', '/projects', { id: project, ...game('Skogens herrar') })).status).toBe(201)
    const leaderCookie = await login('bo@example.com')
    await run.projects.share(project, await accountId('bo@example.com'), 'tester')

    const started = await as(leaderCookie)('POST', `/projects/${project}/sessions`, {})
    expect(started.status).toBe(201)
    const { id } = (await started.json()) as { id: string }
    const ada = await accountId('ada@example.com')
    expect((await run.store.loadSession(id))?.accountId).toBe(ada)

    expect((await owner('DELETE', `/projects/${project}`)).status).toBe(200)
    expect((await run.store.loadSession(id))?.accountId).toBe(ada)
  })
})

describe('den råa dörren utan konton (lokal utveckling, #1194)', () => {
  let run: Running
  afterEach(async () => {
    await run.stop()
  })

  it('öppnar ett bord som i dag, och ingen bär det', async () => {
    run = await start({ auth: false })
    const res = await fetch(`${run.http}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'utan-konton', version: 'v1', setup: twoSeatSetup() }) })
    expect(res.status).toBe(201)
    const session = await run.store.loadSession('utan-konton')
    expect(session).not.toBeNull()
    expect(session?.accountId).toBeUndefined()
  })
})

// Bakåtfyllnaden (#1194): ett bord från före bäraren får sitt spels ägare, så länge spelet finns och
// har en ägare. Ett bord utan spel, ett från ett spel som togs bort och ett från ett spel från före
// konton har ingen att ge den, och får ingen.
describe.skipIf(!url)('bakåtfyllnaden av sessions.account_id (#1194)', () => {
  const before = `test_bearer_fill_${process.pid}_${Date.now()}`
  let pg: PostgresLogStore
  afterAll(async () => {
    await pg.dropSchema()
    await pg.close()
  })

  it('ger varje session vars spel finns sin ägare, och rör ingen session utan', async () => {
    pg = PostgresLogStore.connect(url!, { schema: before })
    await pg.migrate()
    const projects = pg.projects()
    await projects.create('p-agd', game('Ägt') as never, '7')
    await projects.create('p-gammal', game('Från före konton') as never)
    await projects.create('p-borta', game('Borttaget') as never, '7')

    // Lådan som den stod före bäraren: kolumnen finns inte, och borden står där de stod.
    const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: before } })
    try {
      await sql`alter table sessions drop column account_id`
      // Och dess schema fördes upp till ett äldre skript, så nästa start kör det här (#1442).
      await sql`delete from schema_migrations where name = 'server/001-init.sql'`
      const setup = sql.json(twoSeatSetup() as never)
      await sql`insert into sessions (id, version, setup, project) values ('s-agd', 'rev-1', ${setup}, 'p-agd'), ('s-gammal', 'rev-1', ${setup}, 'p-gammal'), ('s-borta', 'rev-1', ${setup}, 'p-borta'), ('s-raa', 'v1', ${setup}, null)`
    } finally {
      await sql.end()
    }
    await projects.remove('p-borta')

    await pg.migrate()
    expect((await pg.loadSession('s-agd'))?.accountId).toBe('7')
    expect((await pg.loadSession('s-gammal'))?.accountId).toBeUndefined()
    expect((await pg.loadSession('s-borta'))?.accountId).toBeUndefined()
    expect((await pg.loadSession('s-raa'))?.accountId).toBeUndefined()

    // Att köra migreringen igen ändrar ingenting: en bärare som en gång satts står kvar.
    await pg.migrate()
    expect((await pg.loadSession('s-agd'))?.accountId).toBe('7')
  })
})

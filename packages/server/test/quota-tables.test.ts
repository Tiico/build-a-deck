import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, TableHost, createServer, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, type AccountPlanStore } from '../src/account-plans.js'
import type { AssetStore } from '../src/assets.js'
import type { ProjectStore } from '../src/projects.js'
import { DEFAULT_PLANS, plansFromEnv, type Plans } from '../src/quotas.js'
import { WireClient } from './client.js'
import { listenInBand, registry, start, twoSeatSetup, type Running } from './fixture.js'
import { deck, template } from './deck.js'

// Tables as a measure (#1196, #1192 question 3): open tables at once (`openTables`), the ceiling
// that guards the box's memory (DRIFT §1), and tables started over a rolling 30 days
// (`tablesPer30Days`), the one that follows use. Both are counted out of the sessions and their
// bearer (#1194), asked when a table is started — from a game and at the raw door — and said as 402
// when met, with nothing made. Nothing else a table does asks a ceiling: playing, joining, a new
// code, a refresh, a kick and ending it never do, and neither does a replay.
//
// Against the memory stores and against Postgres, whose queries and locks are the ones the box
// answers with. The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_quota_tables_${process.pid}_${Date.now()}`
const DAY = 24 * 3600 * 1000
// Postgres stamps a start with its own clock, which in a container may stand a little apart from this one.
const CLOCKS = 2000

type Backend = { store: LogStore; projects: ProjectStore; auth: AuthStore; accountPlans: AccountPlanStore; assets: AssetStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async () => ({ store: new MemoryLogStore(), projects: new MemoryProjectStore(), auth: new MemoryAuthStore(), accountPlans: new MemoryAccountPlanStore(), assets: new MemoryAssetStore(), close: () => Promise.resolve() }),
  },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        store,
        projects: store.projects(),
        auth: store.auth(),
        accountPlans: store.accountPlans(),
        assets: store.assets(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

type Ceilings = { openTables?: number | null; tablesPer30Days?: number | null }
// The default tier with the ceilings given, and `pro` with none.
const tiers = (free: Ceilings): Plans => plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free, pro: {} } }) })
// A game of its own card, so that each game's table queues textures no other game's has.
let games = 0
const game = (name = 'Skogens herrar') => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: `Drake ${process.pid}-${++games}`, antal: 2 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

for (const backend of backends) {
  describe.skipIf(backend.skip)(`tables an account bears, held to its tier, in ${backend.name} (#1196)`, () => {
    let db: Backend
    let run: Running
    let n = 0
    // The server's clock, which the rolling window is counted back from.
    let now = Date.now()
    const open = async (plans: Plans) => {
      now = Date.now()
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, assets: db.assets, accountPlans: db.accountPlans, plans, now: () => new Date(now) })
    }
    const login = async (email: string): Promise<{ cookie: string; id: string }> => {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id }
    }
    // A fresh address per test, so the tables of one test never count in another's.
    const someone = (who: string) => login(`${who}-${++n}@example.com`)
    const send = (method: string, path: string, cookie: string | null, body?: unknown) =>
      fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body === undefined ? null : JSON.stringify(body) })
    const gameOf = async (cookie: string): Promise<string> => ((await (await send('POST', '/projects', cookie, game())).json()) as { id: string }).id
    const startAt = (cookie: string, project: string) => send('POST', `/projects/${project}/sessions`, cookie)
    type Started = { id: string; code: string; hostKey: string; version: string }
    const started = async (res: Response): Promise<Started> => {
      expect(res.status).toBe(201)
      return (await res.json()) as Started
    }
    const raw = (cookie: string | null) => send('POST', '/sessions', cookie, { version: 'v1', setup: twoSeatSetup(), deck })
    // Ends a table the way its own screen does (C9): `session.end` on the table's line.
    const end = async (table: Started) => {
      const screen = await WireClient.connect(run.base, table.id, null, undefined, { host: table.hostKey })
      expect(await screen.send(null, { v: 'session.end' })).toMatchObject({ t: 'ack' })
      await screen.close()
    }
    const usage = async (cookie: string) => ((await (await send('GET', '/me/usage', cookie)).json()) as { plan: string; measures: Record<string, { used: number; limit: number | null }> })
    // Every texture job queued so far, taken off the queue, so a test can ask whether a refusal queued one.
    const drain = async () => {
      while (await run.renders.claim(Date.now()));
    }

    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(async () => {
      await run.stop()
    })

    it('without BYD_PLANS starts as many tables as anyone likes, and counts both measures', async () => {
      await open(DEFAULT_PLANS)
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      const tables = [await started(await startAt(ada.cookie, project)), await started(await startAt(ada.cookie, project)), await started(await startAt(ada.cookie, project))]
      await started(await raw(ada.cookie))
      await end(tables[0]!)
      expect((await usage(ada.cookie)).measures).toMatchObject({ openTables: { used: 3, limit: null }, tablesPer30Days: { used: 4, limit: null } })
    })

    it('with openTables 1 refuses a second table while the first stands, and makes no session, no code and no render job', async () => {
      await open(tiers({ openTables: 1 }))
      const ada = await someone('ada')
      await started(await startAt(ada.cookie, await gameOf(ada.cookie)))
      await drain()
      const loaded = (await run.host.loaded()).length
      const other = await gameOf(ada.cookie)
      const refused = await startAt(ada.cookie, other)
      expect(refused.status).toBe(402)
      expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'openTables', limit: 1, used: 1, bearer: 'you' } })
      expect(await run.store.sessionsOf(other)).toEqual([])
      expect((await run.host.loaded()).length).toBe(loaded)
      expect(await run.renders.claim(Date.now())).toBeNull()
      expect((await usage(ada.cookie)).measures).toMatchObject({ openTables: { used: 1, limit: 1 }, tablesPer30Days: { used: 1, limit: null } })
    })

    it('lets the next table start once the first is ended, by its screen or by the timeout in C9', async () => {
      await open(tiers({ openTables: 1 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      const first = await started(await startAt(ada.cookie, project))
      expect((await startAt(ada.cookie, project)).status).toBe(402)
      await end(first)
      const second = await started(await startAt(ada.cookie, project))
      expect((await startAt(ada.cookie, project)).status).toBe(402)
      // Nobody has touched it since it started: the timeout ends it as the table.
      expect(await run.host.endStale(new Date(Date.now() + 1000))).toContain(second.id)
      await started(await startAt(ada.cookie, project))
    })

    it('with tablesPer30Days 2 refuses the third start within 30 days, though the first two ended and their game is gone', async () => {
      await open(tiers({ tablesPer30Days: 2 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      const before = Date.now()
      await end(await started(await startAt(ada.cookie, project)))
      const between = Date.now()
      await end(await started(await startAt(ada.cookie, project)))
      expect((await send('DELETE', `/projects/${project}`, ada.cookie)).status).toBe(200)
      const refused = await startAt(ada.cookie, await gameOf(ada.cookie))
      expect(refused.status).toBe(402)
      const body = (await refused.json()) as { quota: { frees: string } }
      expect(body).toEqual({ error: 'quota', quota: { measure: 'tablesPer30Days', limit: 2, used: 2, bearer: 'you', frees: expect.any(String) } })
      // When the next table can be started (#1198): the oldest start in the window, 30 days on.
      expect(Date.parse(body.quota.frees)).toBeGreaterThanOrEqual(before + 30 * DAY - CLOCKS)
      expect(Date.parse(body.quota.frees)).toBeLessThanOrEqual(between + 30 * DAY + CLOCKS)
      expect((await usage(ada.cookie)).measures).toMatchObject({ openTables: { used: 0, limit: null }, tablesPer30Days: { used: 2, limit: 2 } })
    })

    // `frees` is the moment the next start goes through (#1198): not a moment before it.
    it('says when the next table can be started, and it can be started then', async () => {
      await open(tiers({ tablesPer30Days: 1 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      await end(await started(await startAt(ada.cookie, project)))
      const { quota } = (await (await startAt(ada.cookie, project)).json()) as { quota: { frees: string } }
      now = Date.parse(quota.frees) - 1
      const still = await startAt(ada.cookie, project)
      expect(still.status).toBe(402)
      expect(((await still.json()) as { quota: { frees: string } }).quota.frees).toBe(quota.frees)
      now = Date.parse(quota.frees)
      await started(await startAt(ada.cookie, project))
    })

    // Over the ceiling, the oldest start falling out makes no room: the date is when enough have.
    it('says when there is room again for an account over its ceiling, not when the oldest start falls out', async () => {
      await open(tiers({ tablesPer30Days: 1 }))
      const ada = await someone('ada')
      await db.accountPlans.setPlan(ada.id, 'pro', 'operator')
      const project = await gameOf(ada.cookie)
      await end(await started(await startAt(ada.cookie, project)))
      const between = Date.now()
      await end(await started(await startAt(ada.cookie, project)))
      const after = Date.now()
      await db.accountPlans.clearPlan(ada.id)
      const refused = (await (await startAt(ada.cookie, project)).json()) as { quota: { used: number; frees: string } }
      expect(refused.quota.used).toBe(2)
      expect(Date.parse(refused.quota.frees)).toBeGreaterThanOrEqual(between + 30 * DAY - CLOCKS)
      expect(Date.parse(refused.quota.frees)).toBeLessThanOrEqual(after + 30 * DAY + CLOCKS)
    })

    // Open tables free by being ended, which no date can say.
    it('gives no date with open tables', async () => {
      await open(tiers({ openTables: 1, tablesPer30Days: 5 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      await started(await startAt(ada.cookie, project))
      const { quota } = (await (await startAt(ada.cookie, project)).json()) as { quota: Record<string, unknown> }
      expect(quota).toEqual({ measure: 'openTables', limit: 1, used: 1, bearer: 'you' })
    })

    // Rolling, not by the calendar month (#1192 question 3): a start leaves the window 30 days after it.
    it('counts a start for 30 days and no longer', async () => {
      await open(tiers({ tablesPer30Days: 1 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      await end(await started(await startAt(ada.cookie, project)))
      now += 29 * DAY
      expect((await startAt(ada.cookie, project)).status).toBe(402)
      now += 2 * DAY
      expect((await usage(ada.cookie)).measures['tablesPer30Days']).toEqual({ used: 0, limit: 1 })
      await started(await startAt(ada.cookie, project))
    })

    it('holds the raw door to the same ceilings, borne by the account that knocks', async () => {
      await open(tiers({ openTables: 1 }))
      const ada = await someone('ada')
      await started(await startAt(ada.cookie, await gameOf(ada.cookie)))
      await drain()
      const refused = await raw(ada.cookie)
      expect(refused.status).toBe(402)
      expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'openTables', limit: 1, used: 1, bearer: 'you' } })
      expect(await run.renders.claim(Date.now())).toBeNull()
      // Someone else's door is their own.
      const bo = await someone('bo')
      await started(await raw(bo.cookie))
    })

    // The creator bears the cost of her own testers (A2): a test leader and a co-editor are held to
    // the owner's ceiling, never their own, and told it is the owner's without the owner's address or tier.
    it('holds a test leader and a co-editor to the owner’s ceiling, and names the owner without her address or tier (#1198)', async () => {
      await open(tiers({ openTables: 1 }))
      const ada = await someone('ada')
      const bo = await someone('bo')
      const cy = await someone('cy')
      const project = await gameOf(ada.cookie)
      await db.projects.share(project, bo.id, 'tester')
      await db.projects.share(project, cy.id, 'editor')
      // Bo's own tier has room for any number of tables; it is not his tier that is asked.
      await db.accountPlans.setPlan(bo.id, 'pro', 'operator')
      await started(await startAt(bo.cookie, project))
      // An owner who has given no name is «the game's owner» (#1254, beslut 2): the word her address
      // suggests is never said to anyone she has not said yes to it for.
      const nameless = await startAt(bo.cookie, project)
      expect(nameless.status).toBe(402)
      const unsaid = await nameless.text()
      expect(JSON.parse(unsaid)).toEqual({ error: 'quota', quota: { measure: 'openTables', limit: 1, used: 1, bearer: 'owner' } })
      expect(unsaid).not.toMatch(/ada/i)
      await db.auth.setName(ada.id, 'Ada Lovelace')
      for (const who of [bo, cy]) {
        const refused = await startAt(who.cookie, project)
        expect(refused.status).toBe(402)
        const body = await refused.text()
        expect(JSON.parse(body)).toEqual({ error: 'quota', quota: { measure: 'openTables', limit: 1, used: 1, bearer: 'owner', ownerName: 'Ada Lovelace' } })
        expect(body).not.toContain('ada-')
        expect(body).not.toContain('free')
      }
      // The table Bo started is Ada's, and it is not his.
      expect((await usage(ada.cookie)).measures['openTables']).toEqual({ used: 1, limit: 1 })
      expect((await usage(bo.cookie)).measures['openTables']).toEqual({ used: 0, limit: null })
      // Bo's own raw door is his own, and his tier has room.
      await started(await raw(bo.cookie))
    })

    it('starts the owner’s table on the owner’s tier when the test leader’s own has no room', async () => {
      await open(tiers({ openTables: 0 }))
      const ada = await someone('ada')
      const bo = await someone('bo')
      const project = await gameOf(ada.cookie)
      await db.projects.share(project, bo.id, 'tester')
      await db.accountPlans.setPlan(ada.id, 'pro', 'operator')
      await started(await startAt(bo.cookie, project))
    })

    // A ceiling only stops growth (G5, #1192): an account over it — its tier taken away while two
    // tables stood — plays at, refreshes, rotates the code of, kicks at and ends the tables that
    // stand, and its guests come and sit as before. A replay asks nothing either.
    it('leaves an account over its ceiling everything a standing table does, and its guests their seats', async () => {
      await open(tiers({ openTables: 1 }))
      const ada = await someone('ada')
      await db.accountPlans.setPlan(ada.id, 'pro', 'operator')
      const project = await gameOf(ada.cookie)
      const one = await started(await startAt(ada.cookie, project))
      const two = await started(await startAt(ada.cookie, project))
      await db.accountPlans.clearPlan(ada.id)
      expect((await usage(ada.cookie)).measures['openTables']).toEqual({ used: 2, limit: 1 })
      const refused = await startAt(ada.cookie, project)
      expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'openTables', limit: 1, used: 2, bearer: 'you' } })

      // A guest buys a seat with the code, sits down and plays.
      const join = await send('POST', `/rooms/${one.code}/join`, null, { name: 'Gäst', seat: 'A' })
      expect(join.status).toBe(201)
      const { token } = (await join.json()) as { token: string }
      const guest = await WireClient.connect(run.base, one.id, 'A', undefined, { token })
      expect(await guest.send('A', { v: 'seat.claim', seat: 'A', name: 'Gäst' })).toMatchObject({ t: 'ack' })
      expect(await guest.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })).toMatchObject({ t: 'ack' })
      // An observer comes in too.
      expect((await send('POST', `/rooms/${one.code}/join`, null, { name: 'Tittare' })).status).toBe(201)

      // The table is played back from its log after a restart, and goes on.
      await guest.close()
      await run.restart()
      const back = await WireClient.connect(run.base, one.id, 'A', undefined, { token })
      expect(back.view?.seq).toBeGreaterThanOrEqual(2)
      expect(await back.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })).toMatchObject({ t: 'ack' })

      // «Uppdatera» (C7) moves it to the game's newer version.
      expect((await send('PUT', `/projects/${project}`, ada.cookie, { rev: 1, ...game('Skogens herrar, ändrat') })).status).toBe(200)
      const refreshed = await send('POST', `/sessions/${one.id}/refresh`, ada.cookie, {})
      expect(refreshed.status).toBe(200)
      expect(await refreshed.json()).toMatchObject({ version: 'rev-2' })

      // «Ny kod» and a kick, with the host key.
      const rotated = await fetch(`${run.http}/sessions/${one.id}/code`, { method: 'POST', headers: { authorization: `Bearer ${one.hostKey}` } })
      expect(rotated.status).toBe(200)
      const { hostKey } = (await rotated.json()) as { hostKey: string }
      const kicked = await fetch(`${run.http}/sessions/${one.id}/kick`, { method: 'POST', headers: { authorization: `Bearer ${hostKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ seat: 'A' }) })
      expect(kicked.status).toBe(200)
      await back.close()

      // Ending one leaves one standing, which is the ceiling still; ending the other makes room.
      await end({ ...one, hostKey })
      expect((await startAt(ada.cookie, project)).status).toBe(402)
      await end(two)
      await started(await startAt(ada.cookie, project))
    })

    // Exactly one of two at the last place (#1192): the count and the write are one step.
    it('gives exactly one of two starts at once at openTables − 1', async () => {
      await open(tiers({ openTables: 2 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      await started(await startAt(ada.cookie, project))
      const both = await Promise.all([startAt(ada.cookie, project), startAt(ada.cookie, project)])
      expect(both.map((r) => r.status).sort()).toEqual([201, 402])
      expect((await usage(ada.cookie)).measures['openTables']).toEqual({ used: 2, limit: 2 })
    })

    it('gives exactly one of two starts at once at tablesPer30Days − 1, from a game and at the raw door', async () => {
      await open(tiers({ tablesPer30Days: 2 }))
      const ada = await someone('ada')
      const project = await gameOf(ada.cookie)
      await end(await started(await startAt(ada.cookie, project)))
      const both = await Promise.all([startAt(ada.cookie, project), raw(ada.cookie)])
      expect(both.map((r) => r.status).sort()).toEqual([201, 402])
      expect((await usage(ada.cookie)).measures['tablesPer30Days']).toEqual({ used: 2, limit: 2 })
    })
  })
}

// Without accounts (no `auth`: local development) nobody bears a table, and no ceiling is asked.
describe('a server without accounts (#1196)', () => {
  it('holds no table to any ceiling', async () => {
    const store = new MemoryLogStore()
    const server = createServer({ host: new TableHost(registry, store), store, registry, projects: new MemoryProjectStore(), plans: tiers({ openTables: 0, tablesPer30Days: 0 }) })
    const port = await listenInBand(server)
    try {
      const project = (await (await fetch(`http://127.0.0.1:${port}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game()) })).json()) as { id: string }
      expect((await fetch(`http://127.0.0.1:${port}/projects/${project.id}/sessions`, { method: 'POST' })).status).toBe(201)
      expect((await fetch(`http://127.0.0.1:${port}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', setup: twoSeatSetup() }) })).status).toBe(201)
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

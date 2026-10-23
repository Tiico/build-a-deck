import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, TableHost, createServer, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, type AccountPlanStore } from '../src/account-plans.js'
import type { AssetStore } from '../src/assets.js'
import type { ProjectStore } from '../src/projects.js'
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, packExport } from '../src/export.js'
import { DEFAULT_PLANS, plansFromEnv, type Plans } from '../src/quotas.js'
import { listenInBand, registry, start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// The first measure, games an account owns (#1193, #1192): counted out of `projects.owner`, held at
// every door that makes a game — a new one, an import and a duplicate — and said as 402 with the
// ceiling's numbers when it is met, with nothing written. Without `BYD_PLANS` nothing is limited.
//
// Against the memory stores and against Postgres, whose queries and locks are the ones the box
// answers with. The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_quota_projects_${process.pid}_${Date.now()}`

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

const tiers = (free: number | null, pro: number | null = null): Plans => plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: free }, pro: { projects: pro } } }) })
const game = (name = 'Skogens herrar', icons: Record<string, string> = {}) => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }], icons, setup: { zones, seats, floor, deckZone: 'draw' } }
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

// An export as `GET /projects/:id/export` writes it, of one version that draws a picture the zip
// carries — made here rather than by a server, so the picture is one the server under test has never seen.
function exportOf(picture: Uint8Array): Uint8Array {
  const hash = sha(picture)
  const file = `assets/${hash}.png`
  const doc = game('Importerat', { sol: `asset:${hash}` })
  return packExport({
    manifest: {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: '2026-10-23T00:00:00.000Z',
      project: { id: 'elsewhere', name: doc.name },
      current: { rev: 1 },
      versions: [{ rev: 1, at: '2026-10-22T00:00:00.000Z', doc }],
      assets: [{ hash, file, contentType: 'image/png', size: picture.length }],
      absent: [],
      print: { rev: 1, cards: [], credits: [], warnings: [], errors: [], failed: [] },
    },
    readme: '',
    assets: new Map([[file, picture]]),
    prints: new Map(),
  })
}

let pictures = 0
// A picture nobody has uploaded: a PNG signature and bytes of its own.
const freshPicture = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Buffer.from(`picture-${process.pid}-${++pictures}`)])

for (const backend of backends) {
  describe.skipIf(backend.skip)(`games an account owns, held to its tier, in ${backend.name} (#1193)`, () => {
    let db: Backend
    let run: Running
    let n = 0
    const open = async (plans: Plans) => {
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, assets: db.assets, accountPlans: db.accountPlans, plans })
    }
    const login = async (email: string): Promise<{ cookie: string; id: string }> => {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id }
    }
    // A fresh address per test, so the accounts of one test never count in another's.
    const someone = (who: string) => login(`${who}-${++n}@example.com`)
    const send = (method: string, path: string, cookie: string, body?: unknown) =>
      fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
    const create = (cookie: string, name = 'Skogens herrar') => send('POST', '/projects', cookie, game(name))
    const bring = (cookie: string, zip: Uint8Array) => fetch(`${run.http}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie }, body: Buffer.from(zip) })
    const idOf = async (res: Response) => ((await res.json()) as { id: string }).id

    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(async () => {
      await run.stop()
    })

    describe('without BYD_PLANS', () => {
      beforeEach(() => open(DEFAULT_PLANS))

      it('lets an account make as many games as it likes', async () => {
        const ada = await someone('ada')
        for (let i = 0; i < 5; i++) expect((await create(ada.cookie, `Spel ${i}`)).status).toBe(201)
        expect(await db.projects.owned(ada.id)).toBe(5)
      })

      it('says what the account uses, with no ceiling', async () => {
        expect((await fetch(`${run.http}/me/usage`)).status).toBe(401)
        const ada = await someone('ada')
        await create(ada.cookie)
        const res = await send('GET', '/me/usage', ada.cookie)
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ plan: 'free', measures: { projects: { used: 1, limit: null } } })
      })
    })

    describe('with a ceiling of two games on the default tier', () => {
      beforeEach(() => open(tiers(2)))

      it('refuses the third game with 402 and the ceiling’s numbers, and makes nothing', async () => {
        const ada = await someone('ada')
        expect((await create(ada.cookie, 'Ett')).status).toBe(201)
        expect((await create(ada.cookie, 'Två')).status).toBe(201)
        const third = await create(ada.cookie, 'Tre')
        expect(third.status).toBe(402)
        expect(await third.json()).toEqual({ error: 'quota', quota: { measure: 'projects', limit: 2, used: 2, bearer: 'you' } })
        expect((await (await send('GET', '/projects', ada.cookie)).json() as { name: string }[]).map((p) => p.name).sort()).toEqual(['Ett', 'Två'])
        expect(await (await send('GET', '/me/usage', ada.cookie)).json()).toEqual({ plan: 'free', measures: { projects: { used: 2, limit: 2 } } })
      })

      it('holds an account to its own tier, and the default again when that is taken away', async () => {
        const ada = await someone('ada')
        await db.accountPlans.setPlan(ada.id, 'pro', 'operator')
        for (let i = 0; i < 3; i++) expect((await create(ada.cookie, `Spel ${i}`)).status).toBe(201)
        expect(await (await send('GET', '/me/usage', ada.cookie)).json()).toEqual({ plan: 'pro', measures: { projects: { used: 3, limit: null } } })
        await db.accountPlans.clearPlan(ada.id)
        expect((await create(ada.cookie)).status).toBe(402)
      })

      it('refuses an import at the ceiling before anything is written, its pictures too', async () => {
        const ada = await someone('ada')
        await create(ada.cookie, 'Ett')
        const picture = freshPicture()
        // Under the ceiling an import is a game like any other, and it is counted.
        expect((await bring(ada.cookie, exportOf(picture))).status).toBe(201)
        const another = freshPicture()
        const refused = await bring(ada.cookie, exportOf(another))
        expect(refused.status).toBe(402)
        expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'projects', limit: 2, used: 2, bearer: 'you' } })
        expect(await db.projects.owned(ada.id)).toBe(2)
        expect(await db.assets.get(sha(another))).toBeNull()
      })

      it('refuses a duplicate at the ceiling', async () => {
        const ada = await someone('ada')
        const first = await idOf(await create(ada.cookie, 'Ett'))
        expect((await send('POST', `/projects/${first}/duplicate`, ada.cookie)).status).toBe(201)
        const refused = await send('POST', `/projects/${first}/duplicate`, ada.cookie)
        expect(refused.status).toBe(402)
        expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'projects', limit: 2, used: 2, bearer: 'you' } })
        expect(await db.projects.owned(ada.id)).toBe(2)
      })

      // The one who duplicates owns the copy and bears it (A2, #1192): the owner's tier is never asked.
      it('holds a co-editor’s duplicate to the co-editor’s own ceiling, and gives the copy to them', async () => {
        const ada = await someone('ada')
        const bo = await someone('bo')
        const first = await idOf(await create(ada.cookie, 'Ett'))
        await create(ada.cookie, 'Två')
        await db.projects.share(first, bo.id, 'editor')
        // Ada is at her ceiling; Bo has room.
        const copy = await send('POST', `/projects/${first}/duplicate`, bo.cookie)
        expect(copy.status).toBe(201)
        expect((await db.projects.load(await idOf(copy)))?.owner).toBe(bo.id)
        expect(await db.projects.owned(ada.id)).toBe(2)
        // Bo's own second game puts him at his ceiling, and his next copy is refused as his.
        await create(bo.cookie, 'Bos eget')
        const refused = await send('POST', `/projects/${first}/duplicate`, bo.cookie)
        expect(refused.status).toBe(402)
        expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'projects', limit: 2, used: 2, bearer: 'you' } })
      })

      // Exactly one of two at the last place (#1192): the count and the write are one step.
      it('gives exactly one of two games asked for at once at the ceiling’s last place', async () => {
        const ada = await someone('ada')
        await create(ada.cookie, 'Ett')
        const both = await Promise.all([create(ada.cookie, 'Två'), create(ada.cookie, 'Tre')])
        expect(both.map((r) => r.status).sort()).toEqual([201, 402])
        expect(await db.projects.owned(ada.id)).toBe(2)
      })

      it('gives exactly one of two imports, and of two duplicates, at the last place', async () => {
        const ada = await someone('ada')
        const first = await idOf(await create(ada.cookie, 'Ett'))
        const imports = await Promise.all([bring(ada.cookie, exportOf(freshPicture())), bring(ada.cookie, exportOf(freshPicture()))])
        expect(imports.map((r) => r.status).sort()).toEqual([201, 402])
        const bo = await someone('bo')
        await db.projects.share(first, bo.id, 'editor')
        await create(bo.cookie, 'Bos eget')
        const copies = await Promise.all([send('POST', `/projects/${first}/duplicate`, bo.cookie), send('POST', `/projects/${first}/duplicate`, bo.cookie)])
        expect(copies.map((r) => r.status).sort()).toEqual([201, 402])
        expect(await db.projects.owned(bo.id)).toBe(2)
      })
    })

    // A ceiling only stops growth (G5, #1192): an account over it — the ceiling lowered after its
    // games were made — reads, opens, exports and deletes them as before.
    it('leaves an account over its ceiling everything but a new game', async () => {
      await open(DEFAULT_PLANS)
      const ada = await someone('ada')
      const ids = [await idOf(await create(ada.cookie, 'Ett')), await idOf(await create(ada.cookie, 'Två')), await idOf(await create(ada.cookie, 'Tre'))]
      await run.stop()
      await open(tiers(1))
      const again = await login(`ada-${n}@example.com`)
      expect((await send('GET', '/projects', again.cookie)).status).toBe(200)
      expect((await send('GET', `/projects/${ids[0]}`, again.cookie)).status).toBe(200)
      expect((await send('POST', `/projects/${ids[0]}/export`, again.cookie)).status).toBe(202)
      expect((await send('PUT', `/projects/${ids[0]}`, again.cookie, { rev: 1, ...game('Ett, ändrat') })).status).toBe(200)
      expect((await send('DELETE', `/projects/${ids[1]}`, again.cookie)).status).toBe(200)
      expect(await (await send('GET', '/me/usage', again.cookie)).json()).toEqual({ plan: 'free', measures: { projects: { used: 2, limit: 1 } } })
      const refused = await create(again.cookie, 'Fyra')
      expect(refused.status).toBe(402)
      expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'projects', limit: 1, used: 2, bearer: 'you' } })
    })
  })
}

// Without accounts (no `auth`: local development) nobody bears anything, and no ceiling is asked.
describe('a server without accounts (#1193)', () => {
  it('holds no game to any ceiling', async () => {
    const store = new MemoryLogStore()
    const server = createServer({ host: new TableHost(registry, store), store, registry, projects: new MemoryProjectStore(), plans: tiers(1) })
    const port = await listenInBand(server)
    try {
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/projects`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(game(`Spel ${i}`)) })
        expect(res.status).toBe(201)
      }
      expect((await fetch(`http://127.0.0.1:${port}/me/usage`)).status).toBe(404)
    } finally {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })
})

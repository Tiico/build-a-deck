import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { RuleDoc, Template } from '@byd/template'
import { MemoryRenderStore, PostgresRenderStore, type RenderStore } from '@byd/render/queue'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import type { AssetStore } from '../src/assets.js'
import type { ProjectStore } from '../src/projects.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { deck, template } from './deck.js'

// Renderings, measured in a log (#1197, #1192): a page is content-addressed, so the queue keeps no
// owner and who caused a rendering is written down as it is queued — one line per job `enqueue`
// answered `queued` for, on the bearer. The table's bearer (#1194) for its textures and for
// «Uppdatera», the game's owner for a print, an export and a rulebook, whoever asked for them.
//
// Against the memory stores and against Postgres, the render queue's included. The Postgres half
// runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_quota_renders_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; projects: ProjectStore; auth: AuthStore; assets: AssetStore; renders: RenderStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async () => {
      const assets = new MemoryAssetStore()
      return { store: new MemoryLogStore(), projects: new MemoryProjectStore(assets), auth: new MemoryAuthStore(), assets, renders: new MemoryRenderStore(), close: () => Promise.resolve() }
    },
  },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      const renders = PostgresRenderStore.connect(url!, undefined, { schema })
      await renders.migrate()
      return {
        store,
        projects: store.projects(),
        auth: store.auth(),
        assets: store.assets(),
        renders,
        close: async () => {
          await renders.close()
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

// A game of `pages` cards that nobody has drawn yet: each title, the back and the rulebook are the
// game's own, so no page is one an earlier test queued.
let made = 0
const ownBack = (n: number): Template => ({ ...template, faces: { ...template.faces, back: { base: [{ kind: 'shape', id: 'bg', x: -3, y: -3, w: 69, h: 94, shape: 'rect', fill: `#${n.toString(16).padStart(6, '0')}` }], variants: {} } } })
const game = (pages: number) => {
  const { zones, seats, floor } = twoSeatSetup()
  const tag = `${schema}-${++made}`
  const rules: RuleDoc = { title: tag, blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }] }
  return { name: 'Skogens herrar', template: ownBack(made), rules, rows: Array.from({ length: pages }, (_, i) => ({ id: `kort-${i}`, fields: { title: `${tag} kort ${i}`, antal: 1 } })), icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

for (const backend of backends) {
  describe.skipIf(backend.skip)(`renderings on the bearer, in ${backend.name} (#1197)`, () => {
    let db: Backend
    let run: Running
    let n = 0
    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(async () => {
      await run.stop()
    })
    const open = async () => {
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, assets: db.assets, renders: db.renders })
    }
    const login = async (email: string): Promise<{ cookie: string; id: string }> => {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id }
    }
    const someone = (who: string) => login(`${who}-${++n}@example.com`)
    const send = (cookie: string, method: string, path: string, body?: unknown) =>
      fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
    const renders = (account: string) => db.renders.rendersBy(account, 0)
    // A game the owner makes, shared with a second account in a role.
    const shared = async (pages: number, role: 'editor' | 'tester' | 'viewer') => {
      const owner = await someone('ada')
      const other = await someone('bo')
      const res = await send(owner.cookie, 'POST', '/projects', game(pages))
      expect(res.status).toBe(201)
      const { id } = (await res.json()) as { id: string }
      await db.projects.share(id, other.id, role)
      return { owner, other, id }
    }

    it('a table started with ten new pages writes one line per page on its bearer, and starting it again writes none', async () => {
      await open()
      const { owner, other, id } = await shared(10, 'tester')
      const started = await send(other.cookie, 'POST', `/projects/${id}/sessions`, {})
      expect(started.status).toBe(201)
      const table = ((await started.json()) as { id: string }).id
      // Ten fronts of their own and the one back they share: every page the table needs, queued once.
      const pages = (await run.host.get(table))!.textureHashes()
      expect(pages).toHaveLength(11)
      expect(await renders(owner.id)).toBe(11)
      // The test leader who pressed bears nothing: the game's owner bears her testers (A2).
      expect(await renders(other.id)).toBe(0)

      // Loaded again, as after a restart: every page is queued already, and costs nothing again.
      await run.restart()
      await run.host.get(table)
      expect(await renders(owner.id)).toBe(11)
      // And a second table of the same game draws the same pages.
      expect((await send(other.cookie, 'POST', `/projects/${id}/sessions`, {})).status).toBe(201)
      expect(await renders(owner.id)).toBe(11)
    })

    it('a table at the raw door is borne by the account that opened it, and so are its pages', async () => {
      await open()
      const ada = await someone('ada')
      const tag = `${schema}-raw-${++made}`
      const own = { ...deck, template: ownBack(++made), rows: Object.fromEntries(Object.keys(deck.rows).map((c) => [c, { title: `${tag} ${c}` }])) }
      const res = await send(ada.cookie, 'POST', '/sessions', { id: tag, version: 'v1', setup: twoSeatSetup(), deck: own })
      expect(res.status).toBe(201)
      const pages = (await run.host.get(tag))!.textureHashes()
      expect(pages.length).toBeGreaterThan(0)
      expect(await renders(ada.id)).toBe(pages.length)
    })

    it('«Uppdatera» is borne by the table, so its new pages land on the bearer whoever pressed', async () => {
      await open()
      const { owner, other, id } = await shared(2, 'editor')
      const table = ((await (await send(other.cookie, 'POST', `/projects/${id}/sessions`, {})).json()) as { id: string }).id
      const before = await renders(owner.id)
      // A third card, saved as a new version by the co-editor, and the table prepared and refreshed by her.
      const rec = (await (await send(owner.cookie, 'GET', `/projects/${id}`)).json()) as { rev: number; rows: unknown[]; template: Template; rules: RuleDoc }
      const next = { ...game(0), template: rec.template, rules: rec.rules, rows: [...rec.rows, { id: 'kort-ny', fields: { title: `${schema} ny ${++made}`, antal: 1 } }] }
      expect((await send(other.cookie, 'PUT', `/projects/${id}`, { rev: rec.rev, ...next })).status).toBe(200)
      expect((await send(other.cookie, 'POST', `/sessions/${table}/prepare`)).status).toBe(200)
      expect(await renders(owner.id)).toBe(before + 1)
      expect((await send(other.cookie, 'POST', `/sessions/${table}/refresh`)).status).toBe(200)
      expect(await renders(owner.id)).toBe(before + 1)
      expect(await renders(other.id)).toBe(0)
    })

    it('«Uppdatera» without preparing first queues the new pages on the table’s bearer too', async () => {
      await open()
      const { owner, other, id } = await shared(2, 'editor')
      const table = ((await (await send(other.cookie, 'POST', `/projects/${id}/sessions`, {})).json()) as { id: string }).id
      const before = await renders(owner.id)
      const rec = (await (await send(owner.cookie, 'GET', `/projects/${id}`)).json()) as { rev: number; rows: unknown[]; template: Template; rules: RuleDoc }
      const next = { ...game(0), template: rec.template, rules: rec.rules, rows: [...rec.rows, { id: 'kort-ny', fields: { title: `${schema} ny ${++made}`, antal: 1 } }] }
      expect((await send(other.cookie, 'PUT', `/projects/${id}`, { rev: rec.rev, ...next })).status).toBe(200)
      expect((await send(other.cookie, 'POST', `/sessions/${table}/refresh`)).status).toBe(200)
      expect(await renders(owner.id)).toBe(before + 1)
      expect(await renders(other.id)).toBe(0)
    })

    it('a print a viewer asks for is the owner’s', async () => {
      await open()
      const { owner, other, id } = await shared(3, 'viewer')
      expect((await send(other.cookie, 'POST', `/projects/${id}/print`, {})).status).toBe(202)
      expect(await renders(owner.id)).toBeGreaterThan(0)
      expect(await renders(other.id)).toBe(0)
    })

    it('an export a co-editor asks for is the owner’s, and asking again costs nothing', async () => {
      await open()
      const { owner, other, id } = await shared(3, 'editor')
      expect((await send(other.cookie, 'POST', `/projects/${id}/export`)).status).toBe(202)
      const once = await renders(owner.id)
      expect(once).toBeGreaterThan(0)
      expect((await send(other.cookie, 'GET', `/projects/${id}/export`)).status).toBe(202)
      expect(await renders(owner.id)).toBe(once)
      expect(await renders(other.id)).toBe(0)
    })

    it('a rulebook a viewer asks for is the owner’s', async () => {
      await open()
      const { owner, other, id } = await shared(1, 'viewer')
      expect((await send(other.cookie, 'POST', `/projects/${id}/rulebook`)).status).toBe(202)
      expect(await renders(owner.id)).toBe(1)
      expect(await renders(other.id)).toBe(0)
    })

    it('says what the account has rendered in the last thirty days in GET /me/usage, with no ceiling', async () => {
      await open()
      const { owner, other, id } = await shared(2, 'tester')
      expect((await send(other.cookie, 'POST', `/projects/${id}/sessions`, {})).status).toBe(201)
      const usage = (await (await send(owner.cookie, 'GET', '/me/usage')).json()) as { measures: Record<string, { used: number; limit: number | null }> }
      expect(usage.measures['rendersPer30Days']).toEqual({ used: 3, limit: null })
    })
  })
}

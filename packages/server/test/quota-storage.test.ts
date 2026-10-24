import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import postgres from 'postgres'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, type AccountPlanStore } from '../src/account-plans.js'
import { assetHashesOf, type AssetStore } from '../src/assets.js'
import type { ProjectStore } from '../src/projects.js'
import type { EditorMessage } from '../src/project-actor.js'
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, packExport } from '../src/export.js'
import { DEFAULT_PLANS, plansFromEnv, type Plans } from '../src/quotas.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// Storage (#1197, #1192 question 4): what the account's games use, not what it has put on the box.
// The sum of the sizes of the distinct `asset:<hash>` that some version of some game the account
// owns names — derived out of the data, so there is nothing kept beside it that could drift. The
// history counts, since it is kept and exported (G5); a game taken away frees what no other game of
// the account names. The ceiling is asked where a new hash comes into one of the account's games:
// an upload that names its game, an import, and a version saved — and what is borne already costs
// nothing again. Assets are still never deleted from the box (DRIFT §4).
//
// Against the memory stores and against Postgres, whose queries and locks are the ones the box
// answers with. The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_quota_storage_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; projects: ProjectStore; auth: AuthStore; accountPlans: AccountPlanStore; assets: AssetStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async () => {
      const assets = new MemoryAssetStore()
      return { store: new MemoryLogStore(), projects: new MemoryProjectStore(assets), auth: new MemoryAuthStore(), accountPlans: new MemoryAccountPlanStore(), assets, close: () => Promise.resolve() }
    },
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

const ceiling = (storageBytes: number | null): Plans => plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { storageBytes } } }) })
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
// A game that names its pictures: the first as a symbol, every one as a card's picture.
const game = (name: string, hashes: readonly string[] = []) => {
  const { zones, seats, floor } = twoSeatSetup()
  const icons: Record<string, string> = hashes[0] ? { sol: `asset:${hashes[0]}` } : {}
  return { name, template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 1 } }, ...hashes.map((h, i) => ({ id: `bild-${i}`, fields: { title: `Bild ${i}`, bild: `asset:${h}`, antal: 1 } }))], icons, setup: { zones, seats, floor, deckZone: 'draw' } }
}

let pictures = 0
// A picture nobody has uploaded, of exactly `size` bytes: a PNG signature and bytes of its own.
const freshPicture = (size = 100): Uint8Array => {
  const head = [137, 80, 78, 71, 13, 10, 26, 10, ...Buffer.from(`${++pictures}-`)]
  if (size < head.length) throw new Error(`a picture of ${size} bytes is shorter than its own head`)
  return new Uint8Array([...head, ...new Array<number>(size - head.length).fill(7)])
}

// An export of one version that names the pictures the zip carries, made here so the pictures are
// ones the server under test has never seen.
function exportOf(carried: readonly Uint8Array[], named: readonly string[] = carried.map(sha)): Uint8Array {
  const doc = game('Importerat', named)
  const files = carried.map((bytes) => ({ hash: sha(bytes), file: `assets/${sha(bytes)}.png`, bytes }))
  return packExport({
    manifest: {
      format: EXPORT_FORMAT,
      formatVersion: EXPORT_FORMAT_VERSION,
      exportedAt: '2026-10-23T00:00:00.000Z',
      project: { id: 'elsewhere', name: doc.name },
      current: { rev: 1 },
      versions: [{ rev: 1, at: '2026-10-22T00:00:00.000Z', doc }],
      assets: files.map((f) => ({ hash: f.hash, file: f.file, contentType: 'image/png', size: f.bytes.length })),
      absent: [],
      print: { rev: 1, cards: [], credits: [], warnings: [], errors: [], failed: [] },
    },
    readme: '',
    assets: new Map(files.map((f) => [f.file, f.bytes])),
    prints: new Map(),
  })
}

type Quota = { error: string; quota: { measure: string; limit: number; used: number; bearer: string; ownerName?: string } }

for (const backend of backends) {
  describe.skipIf(backend.skip)(`storage, what the account's games use, in ${backend.name} (#1197)`, () => {
    let db: Backend
    let run: Running
    let n = 0
    const open = async (plans: Plans, projects: ProjectStore = db.projects) => {
      run = await start({ store: db.store, projects, auth: db.auth, assets: db.assets, accountPlans: db.accountPlans, plans })
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
    const upload = (cookie: string, bytes: Uint8Array, project?: string) =>
      fetch(`${run.http}/assets${project ? `?project=${encodeURIComponent(project)}` : ''}`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: Buffer.from(bytes) })
    const uploaded = async (cookie: string, bytes: Uint8Array): Promise<string> => {
      const res = await upload(cookie, bytes)
      expect(res.status).toBe(201)
      return ((await res.json()) as { hash: string }).hash
    }
    const create = async (cookie: string, name: string, hashes: readonly string[] = []) => send(cookie, 'POST', '/projects', game(name, hashes))
    const made = async (cookie: string, name: string, hashes: readonly string[] = []): Promise<string> => {
      const res = await create(cookie, name, hashes)
      expect(res.status).toBe(201)
      return ((await res.json()) as { id: string }).id
    }
    const save = async (cookie: string, id: string, name: string, hashes: readonly string[]) => {
      const { rev } = (await (await send(cookie, 'GET', `/projects/${id}`)).json()) as { rev: number }
      return send(cookie, 'PUT', `/projects/${id}`, { rev, ...game(name, hashes) })
    }
    const bring = (cookie: string, zip: Uint8Array) => fetch(`${run.http}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie }, body: Buffer.from(zip) })
    const stored = async (cookie: string): Promise<{ used: number; limit: number | null }> => {
      const res = await send(cookie, 'GET', '/me/usage')
      expect(res.status).toBe(200)
      return ((await res.json()) as { measures: Record<string, { used: number; limit: number | null }> }).measures['storageBytes']!
    }
    // The game as its actor holds it, which is what every editor that opens it is handed.
    const live = async (cookie: string, id: string): Promise<{ name: string }> => {
      const ws = new WebSocket(`${run.base}/projects/${id}/edit?name=Ada`, { headers: { cookie } })
      try {
        return await new Promise((resolve, reject) => {
          ws.on('message', (data) => {
            const m = JSON.parse(data.toString()) as EditorMessage
            if (m.v === 'project') resolve(m.doc)
          })
          ws.on('error', reject)
        })
      } finally {
        ws.close()
      }
    }
    const known = async (hash: string) => (await fetch(`${run.http}/assets/${hash}`, { redirect: 'manual' })).status !== 404

    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(async () => {
      await run.stop()
    })

    describe('the measure, counted out of the versions', () => {
      beforeEach(() => open(DEFAULT_PLANS))

      it('is nothing for a picture uploaded that no game names', async () => {
        const ada = await someone('ada')
        await uploaded(ada.cookie, freshPicture(300))
        expect(await stored(ada.cookie)).toEqual({ used: 0, limit: null })
      })

      it('two accounts whose games name the same bytes both bear them, and one account with two such games bears them once', async () => {
        const ada = await someone('ada')
        const bo = await someone('bo')
        const picture = freshPicture(300)
        const hash = await uploaded(ada.cookie, picture)
        await made(ada.cookie, 'Ett', [hash])
        await made(ada.cookie, 'Två', [hash])
        // Bo uploads the same bytes, which the box already has under the same hash.
        expect(await uploaded(bo.cookie, picture)).toBe(hash)
        await made(bo.cookie, 'Bos', [hash])
        expect((await stored(ada.cookie)).used).toBe(300)
        expect((await stored(bo.cookie)).used).toBe(300)
      })

      it('counts the history: a picture an older version names is borne after a newer one drops it', async () => {
        const ada = await someone('ada')
        const a = await uploaded(ada.cookie, freshPicture(120))
        const b = await uploaded(ada.cookie, freshPicture(80))
        const id = await made(ada.cookie, 'Spel', [a])
        expect((await save(ada.cookie, id, 'Spel', [b])).status).toBe(200)
        expect((await stored(ada.cookie)).used).toBe(200)
      })

      it('a game taken away frees what no other game of the account names, and keeps what another does', async () => {
        const ada = await someone('ada')
        const shared = await uploaded(ada.cookie, freshPicture(100))
        const alone = await uploaded(ada.cookie, freshPicture(50))
        const keep = await made(ada.cookie, 'Kvar', [shared])
        const gone = await made(ada.cookie, 'Borta', [shared, alone])
        expect((await stored(ada.cookie)).used).toBe(150)
        expect((await send(ada.cookie, 'DELETE', `/projects/${gone}`)).status).toBe(200)
        expect((await stored(ada.cookie)).used).toBe(100)
        // The bytes stay on the box (DRIFT §4): only the count is freed.
        expect(await known(alone)).toBe(true)
        expect((await send(ada.cookie, 'DELETE', `/projects/${keep}`)).status).toBe(200)
        expect((await stored(ada.cookie)).used).toBe(0)
      })

      it('is the owner’s: a version a co-editor saves counts against the game’s owner and never against her', async () => {
        const ada = await someone('ada')
        const bo = await someone('bo')
        const id = await made(ada.cookie, 'Adas', [])
        await db.projects.share(id, bo.id, 'editor')
        const hash = await uploaded(bo.cookie, freshPicture(90))
        expect((await save(bo.cookie, id, 'Adas', [hash])).status).toBe(200)
        expect((await stored(ada.cookie)).used).toBe(90)
        expect((await stored(bo.cookie)).used).toBe(0)
      })

      it('weighs nothing for a name no asset answers to', async () => {
        const ada = await someone('ada')
        await made(ada.cookie, 'Spöke', ['f'.repeat(64)])
        expect((await stored(ada.cookie)).used).toBe(0)
      })

      it('counts an import’s pictures, carried or already here, on the account that brings it', async () => {
        const ada = await someone('ada')
        const here = await uploaded(ada.cookie, freshPicture(40))
        const carried = freshPicture(60)
        expect((await bring(ada.cookie, exportOf([carried], [sha(carried), here]))).status).toBe(201)
        expect((await stored(ada.cookie)).used).toBe(100)
      })
    })

    describe('without BYD_PLANS', () => {
      beforeEach(() => open(DEFAULT_PLANS))

      it('uploads, saves and imports exactly as today, whatever they weigh', async () => {
        const ada = await someone('ada')
        const id = await made(ada.cookie, 'Stort', [])
        const big = freshPicture(5_000)
        const res = await upload(ada.cookie, big, id)
        expect(res.status).toBe(201)
        expect((await save(ada.cookie, id, 'Stort', [sha(big)])).status).toBe(200)
        expect((await bring(ada.cookie, exportOf([freshPicture(5_000)]))).status).toBe(201)
        expect(await stored(ada.cookie)).toEqual({ used: 10_000, limit: null })
      })
    })

    describe('with a ceiling on storageBytes', () => {
      beforeEach(() => open(ceiling(250)))

      it('says the ceiling in GET /me/usage', async () => {
        const ada = await someone('ada')
        expect(await stored(ada.cookie)).toEqual({ used: 0, limit: 250 })
      })

      it('an upload that names its game is refused with 402 when it would take the owner over, and nothing is written', async () => {
        const ada = await someone('ada')
        const first = freshPicture(200)
        const id = await made(ada.cookie, 'Spel', [await uploaded(ada.cookie, first)])
        expect((await upload(ada.cookie, freshPicture(50), id)).status).toBe(201)
        const over = freshPicture(51)
        const res = await upload(ada.cookie, over, id)
        expect(res.status).toBe(402)
        expect(await res.json()).toEqual({ error: 'quota', quota: { measure: 'storageBytes', limit: 250, used: 200, bearer: 'you' } })
        expect(await known(sha(over))).toBe(false)
        // Bytes the game already names cost nothing again, at the ceiling or not.
        expect((await upload(ada.cookie, first, id)).status).toBe(201)
      })

      it('an upload into someone else’s game is held to the owner’s ceiling, and says so', async () => {
        const ada = await someone('ada')
        const bo = await someone('bo')
        const id = await made(ada.cookie, 'Adas', [await uploaded(ada.cookie, freshPicture(240))])
        await db.projects.share(id, bo.id, 'editor')
        await db.auth.setName(ada.id, 'Ada')
        const res = await upload(bo.cookie, freshPicture(20), id)
        expect(res.status).toBe(402)
        expect(((await res.json()) as Quota).quota).toEqual({ measure: 'storageBytes', limit: 250, used: 240, bearer: 'owner', ownerName: 'Ada' })
      })

      it('an upload without a game writes as today, since no game names it yet', async () => {
        const ada = await someone('ada')
        expect((await upload(ada.cookie, freshPicture(400))).status).toBe(201)
      })

      it('a version that would take the owner over is refused with 402, and no version, edit or document is written', async () => {
        const ada = await someone('ada')
        const a = await uploaded(ada.cookie, freshPicture(200))
        const b = await uploaded(ada.cookie, freshPicture(60))
        const id = await made(ada.cookie, 'Spel', [a])
        const before = (await (await send(ada.cookie, 'GET', `/projects/${id}`)).json()) as { rev: number }
        const res = await save(ada.cookie, id, 'Spel', [a, b])
        expect(res.status).toBe(402)
        expect(await res.json()).toEqual({ error: 'quota', quota: { measure: 'storageBytes', limit: 250, used: 200, bearer: 'you' } })
        const after = (await (await send(ada.cookie, 'GET', `/projects/${id}`)).json()) as { rev: number }
        expect(after.rev).toBe(before.rev)
        expect(await db.projects.versions(id)).toHaveLength(1)
        expect(await db.projects.readEdits(id, 0)).toEqual([])
        // A version that names nothing new is never refused, whatever the account uses.
        expect((await save(ada.cookie, id, 'Spel omdöpt', [a])).status).toBe(200)
      })

      it('a save on the editor’s line that would take the owner over is refused as quota, and no version is made', async () => {
        const ada = await someone('ada')
        const bo = await someone('bo')
        const a = await uploaded(ada.cookie, freshPicture(200))
        const b = await uploaded(bo.cookie, freshPicture(60))
        const id = await made(ada.cookie, 'Spel', [a])
        await db.projects.share(id, bo.id, 'editor')
        await db.auth.setName(ada.id, 'Ada')
        const ws = new WebSocket(`${run.base}/projects/${id}/edit?name=Bo`, { headers: { cookie: bo.cookie } })
        const seen: EditorMessage[] = []
        ws.on('message', (data) => seen.push(JSON.parse(data.toString()) as EditorMessage))
        const until = async (ok: (m: EditorMessage) => boolean): Promise<EditorMessage> => {
          for (let i = 0; i < 200; i++) {
            const found = seen.find(ok)
            if (found) return found
            await new Promise((r) => setTimeout(r, 10))
          }
          throw new Error(`not within two seconds: ${JSON.stringify(seen)}`)
        }
        try {
          await until((m) => m.v === 'project')
          ws.send(JSON.stringify({ t: 'edit', intent: { v: 'setCell', cardRef: 'dragon', field: 'bild', value: `asset:${b}` } }))
          await until((m) => m.v === 'edits')
          ws.send(JSON.stringify({ t: 'save' }))
          const refused = await until((m) => m.v === 'refused')
          expect(refused).toEqual({ v: 'refused', why: 'quota', to: 'save', quota: { measure: 'storageBytes', limit: 250, used: 200, bearer: 'owner', ownerName: 'Ada' } })
          expect(await db.projects.versions(id)).toHaveLength(1)
        } finally {
          ws.close()
        }
      })

      it('a new game that names more than there is room for is refused with 402, and no game is made', async () => {
        const ada = await someone('ada')
        const a = await uploaded(ada.cookie, freshPicture(200))
        const b = await uploaded(ada.cookie, freshPicture(60))
        await made(ada.cookie, 'Ett', [a])
        const res = await create(ada.cookie, 'Två', [b])
        expect(res.status).toBe(402)
        expect(((await res.json()) as Quota).quota).toEqual({ measure: 'storageBytes', limit: 250, used: 200, bearer: 'you' })
        expect(await db.projects.owned(ada.id)).toBe(1)
        // The same bytes in a second game cost nothing again.
        expect((await create(ada.cookie, 'Tre', [a])).status).toBe(201)
      })

      it('an import whose pictures would take the account over is refused with 402, and writes nothing', async () => {
        const ada = await someone('ada')
        await made(ada.cookie, 'Ett', [await uploaded(ada.cookie, freshPicture(200))])
        const carried = freshPicture(60)
        const res = await bring(ada.cookie, exportOf([carried]))
        expect(res.status).toBe(402)
        expect(((await res.json()) as Quota).quota).toEqual({ measure: 'storageBytes', limit: 250, used: 200, bearer: 'you' })
        expect(await db.projects.owned(ada.id)).toBe(1)
        expect(await known(sha(carried))).toBe(false)
      })

      it('an import of pictures the account already bears goes through at the ceiling', async () => {
        const ada = await someone('ada')
        const picture = freshPicture(250)
        await made(ada.cookie, 'Ett', [await uploaded(ada.cookie, picture)])
        expect((await bring(ada.cookie, exportOf([picture]))).status).toBe(201)
        expect((await stored(ada.cookie)).used).toBe(250)
      })

      it('a co-editor’s duplicate is hers, and is held to her own ceiling', async () => {
        const ada = await someone('ada')
        const bo = await someone('bo')
        const a = await uploaded(ada.cookie, freshPicture(200))
        const id = await made(ada.cookie, 'Adas', [a])
        await db.projects.share(id, bo.id, 'editor')
        await made(bo.cookie, 'Bos', [await uploaded(bo.cookie, freshPicture(100))])
        const res = await send(bo.cookie, 'POST', `/projects/${id}/duplicate`)
        expect(res.status).toBe(402)
        expect(((await res.json()) as Quota).quota).toEqual({ measure: 'storageBytes', limit: 250, used: 100, bearer: 'you' })
      })

      // Two `PUT`s on two of the owner's games, each naming a picture of its own, with room for one
      // (#1233). Each is held where its version is written until both are there, so both have
      // passed the door's own question of the ceiling before either version is: the race, every
      // time. The one refused is in no log, no version and on no editor's screen (#1192).
      it('two versions at once with room for one: one is made, and the refused one leaves no edit, version or document behind', async () => {
        const arrived: (() => void)[] = []
        let holding = false
        const held = new Proxy(db.projects, {
          get(target, key) {
            const value: unknown = Reflect.get(target, key)
            if (typeof value !== 'function') return value
            if (key !== 'replace') return value.bind(target)
            return async (...args: unknown[]) => {
              if (holding) await new Promise<void>((go) => arrived.push(go) === 2 && arrived.forEach((both) => both()))
              return value.apply(target, args)
            }
          },
        })
        await run.stop()
        await open(ceiling(250), held)
        const ada = await someone('ada')
        const a = await uploaded(ada.cookie, freshPicture(150))
        const b = await uploaded(ada.cookie, freshPicture(80))
        const c = await uploaded(ada.cookie, freshPicture(80))
        const one = await made(ada.cookie, 'Ett', [a])
        const two = await made(ada.cookie, 'Två', [a])
        holding = true
        const answers = await Promise.all([save(ada.cookie, one, 'Ett ändrat', [a, b]), save(ada.cookie, two, 'Två ändrat', [a, c])])
        expect(answers.map((r) => r.status).sort()).toEqual([200, 402])
        const [refused, was] = answers[0]!.status === 402 ? [answers[0]!, { id: one, name: 'Ett' }] : [answers[1]!, { id: two, name: 'Två' }]
        expect(((await refused.json()) as Quota).quota).toEqual({ measure: 'storageBytes', limit: 250, used: 230, bearer: 'you' })
        expect(await db.projects.readEdits(was.id, 0)).toEqual([])
        expect(await db.projects.versions(was.id)).toHaveLength(1)
        expect((await live(ada.cookie, was.id)).name).toBe(was.name)
        expect((await stored(ada.cookie)).used).toBe(230)
      })

      it('two games at once with room for one: exactly one is made', async () => {
        const ada = await someone('ada')
        await made(ada.cookie, 'Ett', [await uploaded(ada.cookie, freshPicture(150))])
        const b = await uploaded(ada.cookie, freshPicture(80))
        const c = await uploaded(ada.cookie, freshPicture(80))
        const answers = await Promise.all([create(ada.cookie, 'Två', [b]), create(ada.cookie, 'Tre', [c])])
        expect(answers.map((r) => r.status).sort()).toEqual([201, 402])
        expect((await stored(ada.cookie)).used).toBe(230)
      })
    })
  })
}

// The box keeps a derived table so the measure is not a walk over every version at every upload
// (#1197). It must equal what the versions say, and it must be rebuilt out of them: dropped and
// migrated again, it is the same. The memory store keeps nothing beside the versions, so there is
// nothing there to hold to them.
describe.skipIf(!url)('the derived table of the hashes each game names, in Postgres (#1197)', () => {
  const own = `test_storage_cache_${process.pid}_${Date.now()}`
  let pg: PostgresLogStore
  let sql: postgres.Sql
  beforeAll(async () => {
    pg = PostgresLogStore.connect(url!, { schema: own })
    await pg.migrate()
    sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: own } })
  })
  afterAll(async () => {
    await sql.end()
    await pg.dropSchema()
    await pg.close()
  })
  // The definition the way the code says it — `assetHashesOf` over every version of every game the
  // account owns, which is what an export carries — so the SQL that rebuilds the table is held to
  // the same reading of a document as the export is.
  const derived = async (owner: string): Promise<number> => {
    const projects = pg.projects()
    const named = new Set<string>()
    for (const { id } of await projects.list(owner)) {
      if ((await projects.load(id))?.owner !== owner) continue
      for (const { rev } of await projects.versions(id)) for (const hash of assetHashesOf(await projects.at(id, rev))) named.add(hash)
    }
    return Object.values(await pg.assets().sizes([...named])).reduce((n, size) => n + size, 0)
  }

  it('equals what the versions name after making, saving, bringing back and taking away, and is the same rebuilt', async () => {
    const assets = pg.assets()
    const projects = pg.projects()
    const put = (size: number) => assets.put(freshPicture(size), 'image/png')
    const [a, b, c, d, e, f] = [await put(40), await put(60), await put(100), await put(300), await put(500), await put(700)]
    await projects.create('c-ett', game('Ett', [a]) as never, '7')
    await projects.replace('c-ett', 1, game('Ett', [b]) as never)
    // A crop is a use of its picture (L22), and a hash inside a longer string is not one.
    const two = game('Två', [a, c])
    await projects.create('c-två', { ...two, pictures: { [e]: { crop: { x: 0, y: 0, w: 1, h: 1 } } }, rows: [...two.rows, { id: 'text', fields: { title: `se asset:${f}`, antal: 1 } }] } as never, '7')
    await projects.restore('c-tre', [{ rev: 1, at: '2026-10-01T00:00:00.000Z', doc: game('Tre', [d]) as never }], '7')
    await projects.create('c-annan', game('Annan', [d]) as never, '8')
    await projects.remove('c-tre')
    expect(await projects.stored('7')).toBe(40 + 60 + 100 + 500)
    expect(await projects.stored('7')).toBe(await derived('7'))
    expect(await projects.stored('8')).toBe(await derived('8'))

    await sql`drop table project_assets`
    await pg.migrate()
    expect(await projects.stored('7')).toBe(40 + 60 + 100 + 500)
    expect(await projects.stored('8')).toBe(300)
    // And migrating again with the table there changes nothing.
    await pg.migrate()
    expect(await projects.stored('7')).toBe(await derived('7'))
  })
})

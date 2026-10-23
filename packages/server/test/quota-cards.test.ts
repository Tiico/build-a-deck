import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, type AccountPlanStore } from '../src/account-plans.js'
import type { AssetStore } from '../src/assets.js'
import type { ProjectDoc, ProjectStore } from '../src/projects.js'
import type { EditorMessage } from '../src/project-actor.js'
import type { EditIntent } from '../src/edits.js'
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, packExport } from '../src/export.js'
import { DEFAULT_PLANS, plansFromEnv, type Plans } from '../src/quotas.js'
import { cardsUsed } from '../src/quota-cards.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// Cards per game (#1195, #1192), in two measures: rows in the deck, which are the unique cards, and
// copies, the sum of `antal` as `setupFromProject` counts it. Counted out of the living document and
// held in the project actor's decide step, before anything is committed, for every edit there is —
// and at the doors that write a whole document: `PUT /projects/:id`, the import, a new game and a
// duplicate. A ceiling only stops growth: an edit that does not add to a measure always goes through,
// and replaying a log never asks a ceiling at all.
//
// Against the memory stores and against Postgres, whose log and versions are the ones the box keeps.
// The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_quota_cards_${process.pid}_${Date.now()}`

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

// The default tier holds the ceilings under test; `pro` holds none, for a co-editor with room.
const tiers = (free: { cardRowsPerProject?: number | null; cardCopiesPerProject?: number | null }): Plans => plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free, pro: {} } }) })
// A game of `rows` cards, each `antal` copies.
const game = (rows: number, antal = 1, name = 'Skogens herrar'): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: Array.from({ length: rows }, (_, i) => ({ id: `kort-${i + 1}`, fields: { title: `Kort ${i + 1}`, antal } })), icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
const addRow = (cardRef: string): EditIntent => ({ v: 'addRow', cardRef, fields: { title: cardRef, antal: 1 } })

// An export as `GET /projects/:id/export` writes it, of one version that draws a picture the zip
// carries: one the server under test has never seen, so whether the import wrote it can be asked.
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
let pictures = 0
const freshPicture = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Buffer.from(`card-picture-${process.pid}-${++pictures}`)])
function exportOf(game: ProjectDoc, picture: Uint8Array): Uint8Array {
  const hash = sha(picture)
  const file = `assets/${hash}.png`
  const doc = { ...game, icons: { sol: `asset:${hash}` } }
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

// An editor on the wire, as the page is: it numbers its edits (#993) and keeps what it is told.
class Editing {
  readonly seen: EditorMessage[] = []
  private asked = 0
  private constructor(private readonly ws: WebSocket) {}
  static async open(base: string, id: string, cookie: string): Promise<Editing> {
    const ws = new WebSocket(`${base}/projects/${id}/edit?name=x`, { headers: { cookie } })
    const editor = new Editing(ws)
    ws.on('message', (data) => editor.seen.push(JSON.parse(data.toString()) as EditorMessage))
    await new Promise<void>((resolve, reject) => {
      ws.once('message', () => resolve())
      ws.on('error', reject)
      ws.on('close', (code) => reject(new Error(`closed ${code}`)))
    })
    return editor
  }
  // Sends an edit and waits for its answer: the echo, or the refusal that names it.
  async edit(intent: EditIntent): Promise<EditorMessage> {
    const ask = ++this.asked
    this.ws.send(JSON.stringify({ t: 'edit', intent, ask }))
    for (let i = 0; i < 200; i++) {
      const answer = this.seen.find((m) => (m.v === 'refused' && m.ask === ask) || (m.v === 'edits' && m.edits.some((e) => e.ask === ask)))
      if (answer) return answer
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`no answer to edit ${ask}: ${JSON.stringify(this.seen)}`)
  }
  // The document the actor holds, as it hands it over after a refusal.
  last(): Extract<EditorMessage, { v: 'project' }> | undefined {
    return [...this.seen].reverse().find((m): m is Extract<EditorMessage, { v: 'project' }> => m.v === 'project')
  }
  close(): void {
    this.ws.close()
  }
}

describe('what a game uses of its cards (#1195)', () => {
  it('counts rows and copies as the table deals them', () => {
    const doc = game(3, 2)
    expect(cardsUsed(doc)).toEqual({ cardRowsPerProject: 3, cardCopiesPerProject: 6 })
    // `antal` as `setupFromProject` reads it: absent is one, nonsense and below zero are none.
    const odd = { rows: [{ id: 'a', fields: {} }, { id: 'b', fields: { antal: 'x' } }, { id: 'c', fields: { antal: -2 } }, { id: 'd', fields: { antal: 2.7 } }] }
    expect(cardsUsed(odd)).toEqual({ cardRowsPerProject: 4, cardCopiesPerProject: 3 })
  })
})

for (const backend of backends) {
  describe.skipIf(backend.skip)(`cards per game, held to the owner’s tier, in ${backend.name} (#1195)`, () => {
    let db: Backend
    let run: Running | null = null
    let n = 0
    const editors: Editing[] = []
    const open = async (plans: Plans) => {
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, assets: db.assets, accountPlans: db.accountPlans, plans })
      return run
    }
    const http = () => run!.http
    const login = async (email: string): Promise<{ cookie: string; id: string }> => {
      await fetch(`${http()}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run!.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${http()}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id }
    }
    // A fresh address per test, so the accounts of one test never count in another's.
    const someone = (who: string) => login(`${who}-${++n}@example.com`)
    const send = (method: string, path: string, cookie: string, body?: unknown) =>
      fetch(`${http()}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
    // A game the account owns, written straight into the store: a game made under another ceiling,
    // or before there were any.
    const owned = async (owner: string, doc: ProjectDoc): Promise<string> => (await db.projects.create(`p-${process.pid}-${++n}`, doc, owner)).id
    const edit = async (id: string, cookie: string) => {
      const editor = await Editing.open(run!.base, id, cookie)
      editors.push(editor)
      return editor
    }
    const logged = async (id: string) => (await db.projects.readEdits(id, 0)).length

    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    afterEach(async () => {
      for (const editor of editors.splice(0)) editor.close()
      await run?.stop()
      run = null
    })

    it('refuses a fourth row under a ceiling of three, on the wire, and logs nothing of it', async () => {
      await open(tiers({ cardRowsPerProject: 3 }))
      const ada = await someone('ada')
      const id = await owned(ada.id, game(3))
      const editor = await edit(id, ada.cookie)
      const answer = await editor.edit(addRow('kort-4'))
      expect(answer).toEqual({ v: 'refused', why: 'quota', to: 'edit', ask: 1, quota: { measure: 'cardRowsPerProject', limit: 3, used: 3, bearer: 'you' } })
      expect(await logged(id)).toBe(0)
      // And the editor is handed the document as it stands, without the row.
      await expect.poll(() => editor.last()?.doc.rows.length).toBe(3)
      // A row more under the ceiling is a row like any other.
      const below = await owned(ada.id, game(2))
      const other = await edit(below, ada.cookie)
      expect((await other.edit(addRow('kort-3'))).v).toBe('edits')
      expect(await logged(below)).toBe(1)
    })

    it('refuses a compound edit that would cross the ceiling whole, and none of it is kept', async () => {
      await open(tiers({ cardRowsPerProject: 3 }))
      const ada = await someone('ada')
      const id = await owned(ada.id, game(2))
      const editor = await edit(id, ada.cookie)
      // An accepted AI proposal of two cards (#1002): the first fits, the second does not.
      const answer = await editor.edit({ v: 'compound', edits: [addRow('kort-3'), addRow('kort-4')] })
      expect(answer).toMatchObject({ v: 'refused', why: 'quota', quota: { measure: 'cardRowsPerProject', limit: 3, used: 2 } })
      expect(await logged(id)).toBe(0)
      await expect.poll(() => editor.last()?.doc.rows.map((r) => r.id)).toEqual(['kort-1', 'kort-2'])
    })

    it('refuses a change of antal that takes the copies over ten, and lets one that lowers them through', async () => {
      await open(tiers({ cardCopiesPerProject: 10 }))
      const ada = await someone('ada')
      const id = await owned(ada.id, game(3, 3))
      const editor = await edit(id, ada.cookie)
      const up = await editor.edit({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 5 })
      expect(up).toEqual({ v: 'refused', why: 'quota', to: 'edit', ask: 1, quota: { measure: 'cardCopiesPerProject', limit: 10, used: 9, bearer: 'you' } })
      // Up to the ceiling and no further is within it.
      expect((await editor.edit({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 4 })).v).toBe('edits')
      expect((await editor.edit({ v: 'setCell', cardRef: 'kort-2', field: 'antal', value: 1 })).v).toBe('edits')
      // And a row is copies too: a new card of one copy fits again once the copies came down.
      expect((await editor.edit(addRow('kort-4'))).v).toBe('edits')
      expect(await logged(id)).toBe(3)
    })

    // A ceiling only stops growth (#1192): a game over it — the ceiling lowered after it was made —
    // is edited, shrunk and saved as before, and only a new card is refused.
    it('lets every edit that adds nothing through when the game is already over the ceiling', async () => {
      await open(tiers({ cardRowsPerProject: 3, cardCopiesPerProject: 3 }))
      const ada = await someone('ada')
      const id = await owned(ada.id, game(5))
      const editor = await edit(id, ada.cookie)
      expect((await editor.edit({ v: 'setCell', cardRef: 'kort-1', field: 'title', value: 'Drakhona' })).v).toBe('edits')
      expect((await editor.edit({ v: 'patchElement', face: 'front', id: 'title', patch: { font: { family: 'serif', sizePt: 12, weight: 700 } } })).v).toBe('edits')
      expect((await editor.edit({ v: 'removeRow', cardRef: 'kort-5' })).v).toBe('edits')
      expect((await editor.edit({ v: 'setCell', cardRef: 'kort-2', field: 'antal', value: 0 })).v).toBe('edits')
      // Still over: a card more is refused, with what the game uses now.
      expect(await editor.edit(addRow('kort-9'))).toMatchObject({ v: 'refused', why: 'quota', quota: { measure: 'cardRowsPerProject', limit: 3, used: 4 } })
      expect(await logged(id)).toBe(4)
    })

    // The creator bears the cost (A2): a co-editor's card is the owner's to bear, whatever tier the
    // co-editor has, and the refusal says it is the owner's ceiling without saying the owner's tier.
    it('holds a co-editor’s edit to the owner’s ceiling, and says so', async () => {
      await open(tiers({ cardRowsPerProject: 3 }))
      const ada = await someone('ada')
      const bo = await someone('bo')
      await db.accountPlans.setPlan(bo.id, 'pro', 'operator')
      const id = await owned(ada.id, game(3))
      await db.projects.share(id, bo.id, 'editor')
      const editor = await edit(id, bo.cookie)
      expect(await editor.edit(addRow('kort-4'))).toEqual({ v: 'refused', why: 'quota', to: 'edit', ask: 1, quota: { measure: 'cardRowsPerProject', limit: 3, used: 3, bearer: 'owner' } })
      // And the owner's room is the co-editor's: on a tier without the ceiling, Bo's card goes through.
      await db.accountPlans.setPlan(ada.id, 'pro', 'operator')
      expect((await editor.edit(addRow('kort-4'))).v).toBe('edits')
    })

    it('answers a whole document over the ceiling with 402 and writes no version, and lets one that shrinks through', async () => {
      await open(tiers({ cardRowsPerProject: 3 }))
      const ada = await someone('ada')
      const id = await owned(ada.id, game(3))
      const over = await send('PUT', `/projects/${id}`, ada.cookie, { rev: 1, ...game(4) })
      expect(over.status).toBe(402)
      expect(await over.json()).toEqual({ error: 'quota', quota: { measure: 'cardRowsPerProject', limit: 3, used: 3, bearer: 'you' } })
      expect((await db.projects.versions(id)).map((v) => v.rev)).toEqual([1])
      expect(await logged(id)).toBe(0)
      const fewer = await send('PUT', `/projects/${id}`, ada.cookie, { rev: 1, ...game(2) })
      expect(fewer.status).toBe(200)
      expect((await db.projects.load(id))?.rows).toHaveLength(2)
    })

    it('answers an import whose current version is over the ceiling with 402, and writes nothing', async () => {
      await open(tiers({ cardRowsPerProject: 3 }))
      const ada = await someone('ada')
      const bring = (doc: ProjectDoc, picture: Uint8Array) => fetch(`${http()}/projects/import`, { method: 'POST', headers: { 'content-type': 'application/zip', cookie: ada.cookie }, body: Buffer.from(exportOf(doc, picture)) })
      const picture = freshPicture()
      const refused = await bring(game(4, 1, 'Stort'), picture)
      expect(refused.status).toBe(402)
      expect(await refused.json()).toEqual({ error: 'quota', quota: { measure: 'cardRowsPerProject', limit: 3, used: 0, bearer: 'you' } })
      expect(await db.projects.owned(ada.id)).toBe(0)
      expect(await db.assets.get(sha(picture))).toBeNull()
      expect((await bring(game(3, 1, 'Lagom'), freshPicture())).status).toBe(201)
      expect(await db.projects.owned(ada.id)).toBe(1)
    })

    // Every door that writes a game's cards is a door the ceiling stands at, so none of them is a way
    // round it: a new game sent whole, and a copy of a game that is over the ceiling.
    it('holds a new game and a duplicate to the same ceiling, borne by whoever makes them', async () => {
      await open(tiers({ cardRowsPerProject: 3 }))
      const ada = await someone('ada')
      const big = await send('POST', '/projects', ada.cookie, game(4))
      expect(big.status).toBe(402)
      expect(await big.json()).toEqual({ error: 'quota', quota: { measure: 'cardRowsPerProject', limit: 3, used: 0, bearer: 'you' } })
      expect(await db.projects.owned(ada.id)).toBe(0)
      expect((await send('POST', '/projects', ada.cookie, game(3))).status).toBe(201)
      const over = await owned(ada.id, game(5))
      const copy = await send('POST', `/projects/${over}/duplicate`, ada.cookie)
      expect(copy.status).toBe(402)
      expect(await db.projects.owned(ada.id)).toBe(2)
    })

    // Replay never asks a ceiling (D3, #41): a log written once is read as it was written.
    it('replays a log that is already over a ceiling set since, identically and without a refusal', async () => {
      await open(DEFAULT_PLANS)
      const email = `ada-${++n}@example.com`
      const ada = await login(email)
      const id = await owned(ada.id, game(1))
      const editor = await edit(id, ada.cookie)
      for (let i = 2; i <= 5; i++) expect((await editor.edit(addRow(`kort-${i}`))).v).toBe('edits')
      editor.close()
      await run!.stop()
      await open(tiers({ cardRowsPerProject: 3, cardCopiesPerProject: 3 }))
      const again = await login(email)
      const reopened = await edit(id, again.cookie)
      const handed = reopened.last()!
      expect(handed.doc.rows.map((r) => r.id)).toEqual(['kort-1', 'kort-2', 'kort-3', 'kort-4', 'kort-5'])
      expect(handed.seq).toBe(4)
      // And what the game uses is said as the log replays it.
      const usage = (await (await send('GET', '/me/usage', again.cookie)).json()) as { measures: Record<string, unknown> }
      expect(usage.measures['cardRowsPerProject']).toEqual({ used: 5, limit: 3, projects: [{ id, used: 5 }] })
    })

    it('leaves the editor exactly as it is with both ceilings null', async () => {
      await open(tiers({ cardRowsPerProject: null, cardCopiesPerProject: null }))
      const ada = await someone('ada')
      const id = await owned(ada.id, game(1))
      const editor = await edit(id, ada.cookie)
      for (let i = 2; i <= 12; i++) expect((await editor.edit(addRow(`kort-${i}`))).v).toBe('edits')
      expect((await editor.edit({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 99 })).v).toBe('edits')
      expect((await editor.edit({ v: 'replaceRows', rows: game(40).rows })).v).toBe('edits')
      expect(await logged(id)).toBe(13)
      expect((await send('PUT', `/projects/${id}`, ada.cookie, { rev: 1, ...game(60) })).status).toBe(200)
    })

    // What the account uses (#1192): cards per game, for every game it owns and none it is shared,
    // counted out of the living document — the actor's, with the tail nobody has saved.
    it('says the cards of every game the account owns', async () => {
      await open(tiers({ cardRowsPerProject: 10 }))
      const ada = await someone('ada')
      const bo = await someone('bo')
      const small = await owned(ada.id, game(2, 3))
      const large = await owned(ada.id, game(4))
      const bos = await owned(bo.id, game(7))
      await db.projects.share(bos, ada.id, 'editor')
      const editor = await edit(small, ada.cookie)
      expect((await editor.edit(addRow('kort-3'))).v).toBe('edits')
      const usage = (await (await send('GET', '/me/usage', ada.cookie)).json()) as { plan: string; measures: Record<string, unknown> }
      const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => (a.id < b.id ? -1 : 1))
      expect(usage.plan).toBe('free')
      expect(usage.measures['projects']).toEqual({ used: 2, limit: null })
      expect(usage.measures['cardRowsPerProject']).toEqual({ used: 4, limit: 10, projects: byId([{ id: small, used: 3 }, { id: large, used: 4 }]) })
      expect(usage.measures['cardCopiesPerProject']).toEqual({ used: 7, limit: null, projects: byId([{ id: small, used: 7 }, { id: large, used: 4 }]) })
      // An account with no game uses nothing of either.
      const cilla = await someone('cilla')
      const none = (await (await send('GET', '/me/usage', cilla.cookie)).json()) as { measures: Record<string, unknown> }
      expect(none.measures['cardRowsPerProject']).toEqual({ used: 0, limit: 10, projects: [] })
    })
  })
}

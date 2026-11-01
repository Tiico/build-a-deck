import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import { MemoryAccountPlanStore, type AccountPlanStore } from '../src/account-plans.js'
import type { AssetStore } from '../src/assets.js'
import type { EditIntent } from '../src/edits.js'
import type { EditorMessage } from '../src/project-actor.js'
import type { ProjectDoc, ProjectStore } from '../src/projects.js'
import { plansFromEnv, type Plans } from '../src/quotas.js'
import { applyEdit } from '../src/edits.js'
import { onlyShrinks, readOnlyGames, readOnlyReasons, type GameStanding, type FitCeilings } from '../src/read-only.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// The read-only mode L2 (G5 as precised 2026-10-28, #1469, #1491): an account whose subscription
// has lapsed is held to the free tier, and what fits under the free tier's ceilings works as usual,
// while what lies over them may be read and exported but not changed. Which games fit is one rule,
// asked here without HTTP: the most recently changed first, each held to the same measures the
// ceilings are (`projects`, `cardRowsPerProject`, `cardCopiesPerProject`, `storageBytes`).
const none: FitCeilings = { projects: null, cardRowsPerProject: null, cardCopiesPerProject: null, storageBytes: null }
const game = (id: string, changedAt: string, over: Partial<Omit<GameStanding, 'id' | 'changedAt'>> = {}): GameStanding => ({ id, changedAt, rows: 1, copies: 1, assets: {}, ...over })
const sorted = (s: Set<string>) => [...s].sort()

describe('which games of a lapsed account are read-only', () => {
  it('are none when nothing is limited', () => {
    expect(sorted(readOnlyGames(none, [game('a', '2026-10-01T00:00:00Z'), game('b', '2026-10-02T00:00:00Z')]))).toEqual([])
  })

  it('are the games past the free tier’s number, the least recently changed', () => {
    const games = [game('old', '2026-09-01T00:00:00Z'), game('new', '2026-10-03T00:00:00Z'), game('mid', '2026-10-02T00:00:00Z')]
    expect(sorted(readOnlyGames({ ...none, projects: 2 }, games))).toEqual(['old'])
    expect(sorted(readOnlyGames({ ...none, projects: 0 }, games))).toEqual(['mid', 'new', 'old'])
  })

  it('include a game with more unique cards, or more copies, than the free tier holds, which then takes no place', () => {
    const games = [game('big', '2026-10-03T00:00:00Z', { rows: 31 }), game('many', '2026-10-02T00:00:00Z', { copies: 101 }), game('small', '2026-10-01T00:00:00Z')]
    expect(sorted(readOnlyGames({ ...none, projects: 2, cardRowsPerProject: 30, cardCopiesPerProject: 100 }, games))).toEqual(['big', 'many'])
  })

  // Storage is what the fitting games name together, a picture two of them share counted once,
  // as `storageBytes` counts it.
  it('hold the games that fit to the free tier’s storage together, a shared picture weighed once', () => {
    const games = [game('a', '2026-10-03T00:00:00Z', { assets: { p: 60, q: 20 } }), game('b', '2026-10-02T00:00:00Z', { assets: { p: 60, r: 10 } }), game('c', '2026-10-01T00:00:00Z', { assets: { s: 30 } })]
    expect(sorted(readOnlyGames({ ...none, storageBytes: 90 }, games))).toEqual(['c'])
  })

  it('order games changed at the same moment by id, so the answer never depends on the order asked', () => {
    const at = '2026-10-01T00:00:00Z'
    expect(sorted(readOnlyGames({ ...none, projects: 1 }, [game('b', at), game('a', at)]))).toEqual(['b'])
    expect(sorted(readOnlyGames({ ...none, projects: 1 }, [game('a', at), game('b', at)]))).toEqual(['b'])
  })

  // Why each one is (#1511): the ceiling it lies over, so the page can say it in the reader's words.
  // A game over a card measure says that measure, unique cards before copies; one past the number
  // says `projects`; one that would carry the fitting games past the storage says `storageBytes`.
  it('say why each game is read-only: the ceiling it lies over', () => {
    const games = [game('big', '2026-10-05T00:00:00Z', { rows: 31, copies: 200 }), game('many', '2026-10-04T00:00:00Z', { copies: 101 }), game('heavy', '2026-10-03T00:00:00Z', { assets: { p: 80 } }), game('a', '2026-10-02T00:00:00Z'), game('b', '2026-10-01T12:00:00Z'), game('old', '2026-09-01T00:00:00Z')]
    const why = readOnlyReasons({ projects: 2, cardRowsPerProject: 30, cardCopiesPerProject: 100, storageBytes: 50 }, games)
    expect(Object.fromEntries(why)).toEqual({ big: 'cardRowsPerProject', many: 'cardCopiesPerProject', heavy: 'storageBytes', old: 'projects' })
    expect(sorted(readOnlyGames({ projects: 2, cardRowsPerProject: 30, cardCopiesPerProject: 100, storageBytes: 50 }, games))).toEqual(['big', 'heavy', 'many', 'old'])
  })
})

// What a read-only game may still have done to it (beställarens beslut 2026-11-01 i #1469, #1511):
// rows taken away, copies lowered and pictures taken away, and nothing else. Judged on the
// documents, before and after, so a compound edit, a whole document written over HTTP and a version
// are held to the same rule as a single edit.
describe('a change that only makes a read-only game smaller', () => {
  const three = (): ProjectDoc => ({ ...doc('Spel', 3), rows: doc('Spel', 3).rows.map((r) => ({ ...r, fields: { ...r.fields, antal: 3 } })), pictures: { aa: { name: 'sol.png' }, bb: {} } })
  const after = (...edits: EditIntent[]) => edits.reduce((d, e) => applyEdit(d, e), three())

  it('is a row taken away, copies lowered, or a picture taken away, alone or together', () => {
    expect(onlyShrinks(three(), after({ v: 'removeRow', cardRef: 'kort-2' }))).toBe(true)
    expect(onlyShrinks(three(), after({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 1 }))).toBe(true)
    expect(onlyShrinks(three(), after({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 0 }))).toBe(true)
    expect(onlyShrinks(three(), after({ v: 'removePicture', hash: 'aa' }))).toBe(true)
    expect(onlyShrinks(three(), after({ v: 'removeRow', cardRef: 'kort-3' }, { v: 'setCell', cardRef: 'kort-2', field: 'antal', value: 2 }, { v: 'removePicture', hash: 'bb' }))).toBe(true)
    expect(onlyShrinks(three(), three())).toBe(true)
  })

  it('is not anything that adds, raises or changes', () => {
    expect(onlyShrinks(three(), after({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 4 }))).toBe(false)
    expect(onlyShrinks(three(), after({ v: 'setCell', cardRef: 'kort-1', field: 'title', value: 'Drake' }))).toBe(false)
    expect(onlyShrinks(three(), after({ v: 'addRow', cardRef: 'kort-9', fields: { title: 'Ny' } }))).toBe(false)
    expect(onlyShrinks(three(), after({ v: 'addPicture', hash: 'cc' }))).toBe(false)
    expect(onlyShrinks(three(), after({ v: 'rename', name: 'Annat' }))).toBe(false)
    expect(onlyShrinks(three(), after({ v: 'removeRow', cardRef: 'kort-1' }, { v: 'rename', name: 'Annat' }))).toBe(false)
    // Rows put in another order are a change, not a shrink.
    const turned = three()
    expect(onlyShrinks(three(), { ...turned, rows: [...turned.rows].reverse() })).toBe(false)
  })
})

// The mode on the server, against both stores (#1491): Ada has Pro and three games, the free tier
// holds two games of at most three unique cards, and the operator lapses her. The REST doors answer
// a write on a read-only game with 402 and an error of its own, before anything is read or written;
// the editor's line answers `refused` with a `why` of its own. Reading, export, the print PDFs,
// playback and deleting stay open, and tables already standing are never asked.
const url = process.env['DATABASE_URL']
const schema = `test_read_only_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; projects: ProjectStore; auth: AuthStore; accountPlans: AccountPlanStore; assets: AssetStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  {
    name: 'memory',
    skip: false,
    open: async () => {
      // The projects weigh what they name with the same assets the server keeps, as the box's do.
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

const tiers: Plans = plansFromEnv({ BYD_PLANS: JSON.stringify({ default: 'free', plans: { free: { projects: 2, cardRowsPerProject: 3, storageBytes: 30 }, pro: { print: true } } }) })
const doc = (name: string, rows = 1): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: Array.from({ length: rows }, (_, i) => ({ id: `kort-${i + 1}`, fields: { title: `Kort ${i + 1}`, antal: 1 } })), icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
const READ_ONLY = { error: 'read-only' }
const tick = () => new Promise((r) => setTimeout(r, 5))

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
  private async answer(found: (m: EditorMessage, i: number) => boolean): Promise<EditorMessage> {
    for (let i = 0; i < 300; i++) {
      const answer = this.seen.find(found)
      if (answer) return answer
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`no answer: ${JSON.stringify(this.seen)}`)
  }
  async edit(intent: EditIntent): Promise<EditorMessage> {
    const ask = ++this.asked
    this.ws.send(JSON.stringify({ t: 'edit', intent, ask }))
    return this.answer((m) => (m.v === 'refused' && m.ask === ask) || (m.v === 'edits' && m.edits.some((e) => e.ask === ask)))
  }
  async save(): Promise<EditorMessage> {
    const before = this.seen.length
    this.ws.send(JSON.stringify({ t: 'save' }))
    return this.answer((m, i) => i >= before && ((m.v === 'refused' && m.to === 'save') || m.v === 'saved'))
  }
  close(): void {
    this.ws.close()
  }
}
const retitle = (title: string): EditIntent => ({ v: 'setCell', cardRef: 'kort-1', field: 'title', value: title })

for (const backend of backends) {
  describe.skipIf(backend.skip)(`a lapsed account’s games, in ${backend.name} (#1491)`, () => {
    let db: Backend
    let run: Running
    let n = 0
    const editors: Editing[] = []
    const login = async (email: string): Promise<{ cookie: string; id: string }> => {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${run.http}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id }
    }
    const someone = (who: string) => login(`${who}-${++n}@example.com`)
    const send = (method: string, path: string, cookie: string, body?: unknown) =>
      fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
    const edit = async (id: string, cookie: string) => {
      const editor = await Editing.open(run.base, id, cookie)
      editors.push(editor)
      return editor
    }
    // Ada with Pro and three games, the oldest first, so the oldest is the one past the free tier's two.
    const ada = async (rows: [number, number, number] = [1, 1, 1]) => {
      const who = await someone('ada')
      await db.accountPlans.setPlan(who.id, 'pro', 'operator')
      const ids: string[] = []
      for (const [i, r] of rows.entries()) {
        ids.push((await db.projects.create(`ro-${process.pid}-${++n}`, doc(`Spel ${i + 1}`, r), who.id)).id)
        await tick()
      }
      return { ...who, oldest: ids[0]!, ids }
    }
    type Held = { id: string; why: string }
    const usage = async (cookie: string) => (await (await send('GET', '/me/usage', cookie)).json()) as { plan: string; print: boolean; lapsed?: { plan: string; at: string }; readOnly: Held[]; ifLapsed: Held[] }
    const ids = (held: Held[]) => held.map((g) => g.id)
    const saveOver = async (cookie: string, id: string, name: string) => {
      const rev = ((await (await send('GET', `/projects/${id}`, cookie)).json()) as { rev: number }).rev
      return send('PUT', `/projects/${id}`, cookie, { rev, ...doc(name) })
    }

    beforeAll(async () => {
      db = await backend.open()
    })
    afterAll(async () => {
      await db.close()
    })
    beforeEach(async () => {
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, assets: db.assets, accountPlans: db.accountPlans, plans: tiers })
    })
    afterEach(async () => {
      for (const editor of editors.splice(0)) editor.close()
      await run.stop()
    })

    it('says the lapse and which games are read-only in GET /me/usage', async () => {
      const a = await ada()
      expect(await usage(a.cookie)).toMatchObject({ plan: 'pro', print: true, readOnly: [] })
      await db.accountPlans.lapse(a.id)
      expect(await usage(a.cookie)).toMatchObject({ plan: 'free', print: false, lapsed: { plan: 'pro' }, readOnly: [{ id: a.oldest, why: 'projects' }] })
    })

    it('lets the two most recently changed games be edited, saved and started as usual', async () => {
      const a = await ada()
      await db.accountPlans.lapse(a.id)
      for (const id of a.ids.slice(1)) {
        expect((await saveOver(a.cookie, id, 'Ändrat')).status).toBe(200)
        expect((await send('PUT', `/projects/${id}/name`, a.cookie, { name: 'Nytt namn' })).status).toBe(200)
        expect((await send('POST', `/projects/${id}/sessions`, a.cookie)).status).toBe(201)
        const editor = await edit(id, a.cookie)
        expect((await editor.edit(retitle('Drake'))).v).toBe('edits')
        expect((await editor.save()).v).toBe('saved')
      }
    })

    it('opens, reads, exports and plays back the third, but refuses an edit, a save, a rename and a table, saying read-only', async () => {
      const a = await ada()
      const table = (await (await send('POST', `/projects/${a.oldest}/sessions`, a.cookie)).json()) as { id: string; hostKey: string }
      await db.accountPlans.lapse(a.id)
      const before = await db.projects.readEdits(a.oldest, 0)

      expect((await send('GET', `/projects/${a.oldest}`, a.cookie)).status).toBe(200)
      expect((await send('GET', `/projects/${a.oldest}/versions`, a.cookie)).status).toBe(200)
      expect((await send('GET', `/projects/${a.oldest}/playtest`, a.cookie)).status).toBe(200)
      expect((await send('POST', `/projects/${a.oldest}/export`, a.cookie)).status).not.toBe(402)

      for (const refused of [await saveOver(a.cookie, a.oldest, 'Ändrat'), await send('PUT', `/projects/${a.oldest}/name`, a.cookie, { name: 'Nytt' }), await send('POST', `/projects/${a.oldest}/sessions`, a.cookie), await send('POST', `/projects/${a.oldest}/duplicate`, a.cookie)]) {
        expect(refused.status).toBe(402)
        expect(await refused.json()).toEqual(READ_ONLY)
      }
      const upload = await fetch(`${run.http}/assets?project=${a.oldest}`, { method: 'POST', headers: { 'content-type': 'image/png', cookie: a.cookie }, body: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]) })
      expect(upload.status).toBe(402)
      expect(await upload.json()).toEqual(READ_ONLY)

      const editor = await edit(a.oldest, a.cookie)
      expect(await editor.edit(retitle('Drake'))).toEqual({ v: 'refused', why: 'read-only', to: 'edit', ask: 1 })
      expect(await editor.edit({ v: 'addRow', cardRef: 'kort-9', fields: { title: 'Ny' } })).toEqual({ v: 'refused', why: 'read-only', to: 'edit', ask: 2 })
      expect(await editor.edit({ v: 'setCell', cardRef: 'kort-1', field: 'antal', value: 2 })).toEqual({ v: 'refused', why: 'read-only', to: 'edit', ask: 3 })
      expect(await editor.save()).toEqual({ v: 'refused', why: 'read-only', to: 'save' })
      expect(await db.projects.readEdits(a.oldest, 0)).toEqual(before)
      expect((await db.projects.versions(a.oldest)).length).toBe(1)

      // The table that already stood is never asked: a new code goes as it always did.
      expect((await fetch(`${run.http}/sessions/${table.id}/code`, { method: 'POST', headers: { authorization: `Bearer ${table.hostKey}` } })).status).toBe(200)
    })

    // Beställarens beslut 2026-11-01 (#1469, #1511): rows, copies and pictures may be taken away from a
    // read-only game, and nothing else. A shrink goes into the log and may be saved as a version; a
    // whole document written over HTTP goes when it is only a shrink of what stands.
    it('lets a read-only game be made smaller: rows and pictures taken away, copies lowered, and saved', async () => {
      const a = await ada([1, 1, 4])
      await db.accountPlans.lapse(a.id)
      const big = a.ids[2]!
      const editor = await edit(big, a.cookie)
      expect((await editor.edit({ v: 'setCell', cardRef: 'kort-4', field: 'antal', value: 0 })).v).toBe('edits')
      expect((await editor.edit(retitle('Drake'))).v).toBe('refused')
      // Still four rows, over the free tier's three: a version of it made smaller is saved.
      expect((await editor.save()).v).toBe('saved')
      expect((await editor.edit({ v: 'compound', edits: [{ v: 'removeRow', cardRef: 'kort-4' }, { v: 'removePicture', hash: 'ingen' }] })).v).toBe('edits')
      // Three cards fit under the free tier's three: the game is as usual again, with nothing stored about it.
      expect((await usage(a.cookie)).readOnly.map((g) => g.id)).not.toContain(big)
      expect((await editor.edit(retitle('Drake'))).v).toBe('edits')
    })

    it('takes a whole document over HTTP when it only makes a read-only game smaller, and refuses one that changes it', async () => {
      const a = await ada([1, 1, 4])
      await db.accountPlans.lapse(a.id)
      const big = a.ids[2]!
      const got = (await (await send('GET', `/projects/${big}`, a.cookie)).json()) as ProjectDoc & { rev: number }
      const smaller = { ...got, rows: got.rows.slice(0, 2) }
      const grown = await send('PUT', `/projects/${big}`, a.cookie, { ...smaller, name: 'Annat' })
      expect(grown.status).toBe(402)
      expect(await grown.json()).toEqual(READ_ONLY)
      expect((await send('PUT', `/projects/${big}`, a.cookie, smaller)).status).toBe(200)
    })

    // Why each game is read-only, and which would be if the tier lapsed (#1511, for #1492 and #1494).
    it('says why each game is read-only, and which games would be if the tier lapsed', async () => {
      const a = await ada([1, 1, 4])
      const big = a.ids[2]!
      expect(await usage(a.cookie)).toMatchObject({ readOnly: [], ifLapsed: [{ id: big, why: 'cardRowsPerProject' }] })
      await db.accountPlans.lapse(a.id)
      expect(await usage(a.cookie)).toMatchObject({ readOnly: [{ id: big, why: 'cardRowsPerProject' }], ifLapsed: [{ id: big, why: 'cardRowsPerProject' }] })
      const b = await ada()
      await db.accountPlans.lapse(b.id)
      expect((await usage(b.cookie)).readOnly).toEqual([{ id: b.oldest, why: 'projects' }])
      // An account on the default tier has nothing to lapse from.
      await db.accountPlans.clearPlan(b.id)
      expect(await usage(b.cookie)).toMatchObject({ readOnly: [], ifLapsed: [] })
    })

    it('holds a game with more unique cards than the free tier to read-only the same way', async () => {
      const a = await ada([1, 1, 4])
      await db.accountPlans.lapse(a.id)
      const big = a.ids[2]!
      expect(ids((await usage(a.cookie)).readOnly)).toEqual([big])
      expect((await saveOver(a.cookie, big, 'Ändrat')).status).toBe(402)
      expect((await saveOver(a.cookie, a.oldest, 'Ändrat')).status).toBe(200)
    })

    // Storage as `storageBytes` weighs it, out of what each game's versions name: two pictures of 20
    // bytes do not fit under 30 together, so the older of the two games that name them is read-only.
    it('holds the games that fit to the free tier’s storage, by what their versions name', async () => {
      const a = await ada()
      const pictures: string[] = []
      for (const [i, id] of a.ids.slice(1).entries()) {
        const hash = await db.assets.put(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Buffer.from(`${process.pid}-${n}-${i}`.padEnd(12, '.').slice(-12))]), 'image/png')
        pictures.push(hash)
        const rev = ((await (await send('GET', `/projects/${id}`, a.cookie)).json()) as { rev: number }).rev
        expect((await send('PUT', `/projects/${id}`, a.cookie, { rev, ...doc(`Med bild ${i}`), icons: { sol: `asset:${hash}` } })).status).toBe(200)
        await tick()
      }
      expect(Object.values(await db.projects.weighed(a.ids[1]!))).toEqual([20])
      await db.accountPlans.lapse(a.id)
      expect((await usage(a.cookie)).readOnly).toEqual([{ id: a.ids[1], why: 'storageBytes' }])
    })

    it('always lets a game be deleted, and the next one then fits and works again', async () => {
      const a = await ada()
      await db.accountPlans.lapse(a.id)
      expect((await send('DELETE', `/projects/${a.oldest}`, a.cookie)).status).toBe(200)
      expect((await usage(a.cookie)).readOnly).toEqual([])
      const b = await ada()
      await db.accountPlans.lapse(b.id)
      expect((await send('DELETE', `/projects/${b.ids[2]!}`, b.cookie)).status).toBe(200)
      expect((await usage(b.cookie)).readOnly).toEqual([])
      expect((await saveOver(b.cookie, b.oldest, 'Ändrat')).status).toBe(200)
    })

    it('is as usual again when the lapse is lifted, or the account is given a tier again', async () => {
      const a = await ada()
      await db.accountPlans.lapse(a.id)
      const editor = await edit(a.oldest, a.cookie)
      expect((await editor.edit(retitle('Drake'))).v).toBe('refused')
      await db.accountPlans.unlapse(a.id)
      expect((await editor.edit(retitle('Drake'))).v).toBe('edits')
      expect((await usage(a.cookie)).readOnly).toEqual([])
      await db.accountPlans.lapse(a.id)
      await db.accountPlans.setPlan(a.id, 'pro', 'stripe')
      expect((await saveOver(a.cookie, a.oldest, 'Ändrat')).status).toBe(200)
    })

    // A ceiling reached under a tier that holds stops only growth (A2, #1192): three games on the
    // free tier, not lapsed, edit and save as before.
    it('leaves an account over a ceiling it has not lapsed into as before: only growth is stopped', async () => {
      const a = await ada()
      await db.accountPlans.clearPlan(a.id)
      expect((await usage(a.cookie)).readOnly).toEqual([])
      expect((await saveOver(a.cookie, a.oldest, 'Ändrat')).status).toBe(200)
      expect((await send('POST', '/projects', a.cookie, doc('Fyra'))).status).toBe(402)
    })

    // It is the owner's tier that holds (D3, #1195): a co-editor meets the owner's read-only mode, and
    // somebody with no part in the game learns nothing of it.
    it('holds a co-editor to the owner’s read-only mode, and tells a stranger nothing', async () => {
      const a = await ada()
      const bo = await someone('bo')
      const cy = await someone('cy')
      await db.projects.share(a.oldest, bo.id, 'editor')
      await db.accountPlans.lapse(a.id)
      const refused = await saveOver(bo.cookie, a.oldest, 'Ändrat')
      expect(refused.status).toBe(402)
      expect(await refused.json()).toEqual(READ_ONLY)
      expect((await send('PUT', `/projects/${a.oldest}/name`, cy.cookie, { name: 'Nytt' })).status).not.toBe(402)
    })
  })
}

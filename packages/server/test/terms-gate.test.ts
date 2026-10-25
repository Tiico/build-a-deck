import { readFileSync } from 'node:fs'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { MemoryAssetStore, MemoryAuthStore, MemoryLogStore, MemoryProjectStore, PostgresLogStore, type AuthStore, type LogStore } from '../src/index.js'
import type { AssetStore } from '../src/assets.js'
import type { ProjectDoc, ProjectStore } from '../src/projects.js'
import type { EditorMessage } from '../src/project-actor.js'
import type { EditIntent } from '../src/edits.js'
import { OPEN_WRITES, TERMS, openToTheDue, type TermsRegister } from '../src/terms.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// The gate on the closed ways (#1272, F4 beslut 5): an account that has not accepted the terms in
// force may read, export and log out, and nothing else. The server says so on every way that writes,
// with a contract of its own, so that an editor or a page from before the step never loses a write
// silently: `403 { error: 'terms', current }` over HTTP, and `{ v: 'refused', why: 'terms', current }`
// on the editor's line. Accepting opens every way at once, on the same connection.
//
// Against the memory stores and against Postgres, which is where the box keeps the acceptances.
// The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_terms_gate_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; projects: ProjectStore; auth: AuthStore; assets: AssetStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ store: new MemoryLogStore(), projects: new MemoryProjectStore(), auth: new MemoryAuthStore(), assets: new MemoryAssetStore(), close: () => Promise.resolve() }) },
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
        assets: store.assets(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const BETA: TermsRegister = [{ version: '2026-11-01', material: true }]
const game = (name = 'Skogens råd'): ProjectDoc => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name, template, rows: [{ id: 'kort-1', fields: { title: 'Kort 1', antal: 1 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
const addRow = (cardRef: string): EditIntent => ({ v: 'addRow', cardRef, fields: { title: cardRef, antal: 1 } })

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
  async send(message: { t: 'edit'; intent: EditIntent } | { t: 'save' }): Promise<EditorMessage> {
    const ask = message.t === 'edit' ? ++this.asked : undefined
    const before = this.seen.length
    this.ws.send(JSON.stringify(ask === undefined ? message : { ...message, ask }))
    for (let i = 0; i < 200; i++) {
      const answer = this.seen.slice(before).find((m) => (m.v === 'refused' && m.to === message.t && (m.ask === undefined || m.ask === ask)) || (ask !== undefined && m.v === 'edits' && m.edits.some((e) => e.ask === ask)) || (ask === undefined && m.v === 'saved'))
      if (answer) return answer
      await new Promise((r) => setTimeout(r, 10))
    }
    throw new Error(`no answer: ${JSON.stringify(this.seen)}`)
  }
  close(): void {
    this.ws.close()
  }
}

for (const backend of backends) {
  describe.skipIf(backend.skip)(`the closed ways for an account that has not accepted the terms, in ${backend.name} (#1272)`, () => {
    let db: Backend
    let run: Running | null = null
    let n = 0
    const editors: Editing[] = []
    let now = new Date('2026-11-05T10:00:00Z')
    const open = async (terms: TermsRegister = BETA) => {
      run = await start({ store: db.store, projects: db.projects, auth: db.auth, assets: db.assets, now: () => now, terms })
      return run
    }
    const http = () => run!.http
    const login = async (who: string): Promise<{ cookie: string; id: string }> => {
      const email = `${who}-${++n}-${process.pid}@example.com`
      await fetch(`${http()}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run!.mail.sent.findLast((m) => m.to === email)?.text ?? '')?.[0] ?? ''
      const res = await fetch(`${http()}${link}`, { redirect: 'manual' })
      return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '', id: (await db.auth.accountByEmail(email))!.id }
    }
    const call = async (method: string, path: string, cookie: string, body?: unknown) => {
      const res = await fetch(`${http()}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })
      const text = await res.text()
      let json: unknown
      try {
        json = text ? JSON.parse(text) : undefined
      } catch {
        json = text
      }
      return { status: res.status, json }
    }
    const accept = (cookie: string, version = '2026-11-01') => call('POST', '/me/terms', cookie, { version })
    const owned = async (owner: string): Promise<string> => (await db.projects.create(`p-${process.pid}-${++n}`, game(), owner)).id
    const edit = async (id: string, cookie: string) => {
      const editor = await Editing.open(run!.base, id, cookie)
      editors.push(editor)
      return editor
    }

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
      now = new Date('2026-11-05T10:00:00Z')
    })

    it('refuses every way that writes with 403 and the version in force, and writes nothing', async () => {
      await open()
      const ada = await login('ada')
      const id = await owned(ada.id)
      const refused = { status: 403, json: { error: 'terms', current: '2026-11-01' } }
      // A new game, sent whole and imported, and the game's own writes.
      expect(await call('POST', '/projects', ada.cookie, game())).toEqual(refused)
      expect(await call('POST', '/projects/import', ada.cookie, {})).toEqual(refused)
      expect(await call('PUT', `/projects/${id}`, ada.cookie, { ...game('Annat namn'), rev: 1 })).toEqual(refused)
      expect(await call('PUT', `/projects/${id}/name`, ada.cookie, { name: 'Annat namn' })).toEqual(refused)
      expect(await call('POST', `/projects/${id}/duplicate`, ada.cookie)).toEqual(refused)
      expect(await call('POST', `/projects/${id}/sessions`, ada.cookie)).toEqual(refused)
      expect(await call('POST', `/projects/${id}/invites`, ada.cookie, { email: 'bo@example.com', role: 'editor' })).toEqual(refused)
      expect(await call('POST', `/projects/${id}/ai/ask`, ada.cookie, { question: 'Hej' })).toEqual(refused)
      expect(await call('DELETE', `/projects/${id}`, ada.cookie)).toEqual(refused)
      // Bytes, a raw table, and the account's AI key.
      expect(await call('POST', '/assets', ada.cookie, {})).toEqual(refused)
      expect(await call('POST', '/sessions', ada.cookie, { version: 'v1', setup: twoSeatSetup() })).toEqual(refused)
      expect(await call('PUT', '/me/ai-key', ada.cookie, { provider: 'anthropic', key: 'sk-ant-x' })).toEqual(refused)
      // An invitation is followed only once the terms are: whoever follows it changes the game after.
      expect(await call('POST', '/invites/nagon-lank', ada.cookie)).toEqual(refused)
      // Nothing was written: the game is as it was, and the account owns one game.
      const rec = await db.projects.load(id)
      expect(rec).toMatchObject({ name: 'Skogens råd', rev: 1 })
      expect((await call('GET', '/projects', ada.cookie)).json).toHaveLength(1)
    })

    it('leaves reading, exporting and logging out open, and the steps that lead to the terms', async () => {
      await open()
      const ada = await login('ada')
      const id = await owned(ada.id)
      expect((await call('GET', '/projects', ada.cookie)).status).toBe(200)
      expect((await call('GET', `/projects/${id}`, ada.cookie)).status).toBe(200)
      expect((await call('GET', `/projects/${id}/versions`, ada.cookie)).status).toBe(200)
      // Exporting a game is asked for with a POST, and it is the one write the decision names.
      expect((await call('POST', `/projects/${id}/export`, ada.cookie)).status).not.toBe(403)
      // The name is the step before the terms, and the terms are accepted with a write of their own.
      expect(await call('PUT', '/me/name', ada.cookie, { name: 'Ada' })).toEqual({ status: 200, json: { name: 'Ada' } })
      expect((await call('DELETE', '/me/ai-key', ada.cookie)).status).not.toBe(403)
      expect((await call('POST', '/auth/logout', ada.cookie)).status).toBe(200)
    })

    it('opens every way at once when the account accepts, and only for that account', async () => {
      await open()
      const ada = await login('ada')
      const bo = await login('bo')
      expect((await call('POST', '/projects', ada.cookie, game())).status).toBe(403)
      expect((await accept(ada.cookie)).status).toBe(204)
      expect((await call('POST', '/projects', ada.cookie, game())).status).toBe(201)
      expect((await call('POST', '/projects', bo.cookie, game())).status).toBe(403)
    })

    it('closes them again from the day a material version comes into force, and not for an editorial one', async () => {
      await open([
        { version: '2026-11-01', material: true },
        { version: '2026-12-01', material: false },
        { version: '2027-01-01', material: true },
      ])
      const ada = await login('ada')
      expect((await accept(ada.cookie)).status).toBe(204)
      now = new Date('2026-12-02T10:00:00Z')
      expect((await call('POST', '/projects', ada.cookie, game())).status).toBe(201)
      now = new Date('2027-01-01T00:01:00Z')
      expect(await call('POST', '/projects', ada.cookie, game())).toEqual({ status: 403, json: { error: 'terms', current: '2027-01-01' } })
    })

    it('closes nothing while no terms are in force', async () => {
      await open([])
      const ada = await login('ada')
      expect((await call('POST', '/projects', ada.cookie, game())).status).toBe(201)
      // Nor before the first version's day.
      await run!.stop()
      await open([{ version: '2026-12-01', material: true }])
      const bo = await login('bo')
      expect((await call('POST', '/projects', bo.cookie, game())).status).toBe(201)
    })

    it('refuses an edit and a save on the editor\'s line with a refusal of its own, and takes them on the same line once accepted', async () => {
      await open()
      const ada = await login('ada')
      const id = await owned(ada.id)
      const editor = await edit(id, ada.cookie)
      expect(await editor.send({ t: 'edit', intent: addRow('kort-2') })).toEqual({ v: 'refused', why: 'terms', to: 'edit', ask: 1, current: '2026-11-01' })
      expect(await editor.send({ t: 'save' })).toEqual({ v: 'refused', why: 'terms', to: 'save', current: '2026-11-01' })
      expect(await db.projects.readEdits(id, 0)).toHaveLength(0)
      // Accepted from the dialog, the edit the editor held goes through on the line it has open.
      expect((await accept(ada.cookie)).status).toBe(204)
      expect((await editor.send({ t: 'edit', intent: addRow('kort-2') })).v).toBe('edits')
      expect((await editor.send({ t: 'save' })).v).toBe('saved')
      expect(await db.projects.readEdits(id, 0)).toHaveLength(1)
    })

    it('says a viewer\'s refusal first, since accepting would not let a viewer edit either', async () => {
      await open()
      const ada = await login('ada')
      const bo = await login('bo')
      expect((await accept(ada.cookie)).status).toBe(204)
      const id = await owned(ada.id)
      await db.projects.share(id, bo.id, 'viewer')
      const editor = await edit(id, bo.cookie)
      const answer = await editor.send({ t: 'edit', intent: addRow('kort-2') })
      expect(answer).toMatchObject({ v: 'refused', to: 'edit' })
      expect(answer).not.toMatchObject({ why: 'terms' })
    })
  })
}

describe('which writes stay open to an account that has not accepted (#1272)', () => {
  // The list is a decision (F4 beslut 5): read, export and log out, the two steps of the welcome card,
  // a guest's own ways, and the table's host. A way added here is a way the gate lets through.
  it('is the decided list, and every other write is closed', () => {
    expect(OPEN_WRITES.map(([method, path]) => `${method} ${path.source}`)).toEqual([
      'POST ^\\/me\\/terms$',
      'PUT ^\\/me\\/name$',
      'DELETE ^\\/me\\/ai-key$',
      'POST ^\\/projects\\/[^/]+\\/export$',
      'POST ^\\/projects\\/[^/]+\\/print$',
      'POST ^\\/rooms\\/[^/]+\\/join$',
      'POST ^\\/guests\\/claim$',
      'POST ^\\/me\\/played\\/[^/]+\\/return$',
      'POST ^\\/sessions\\/[^/]+\\/survey$',
      'POST ^\\/sessions\\/[^/]+\\/(?:code|kick)$',
    ])
    expect(openToTheDue('GET', '/projects')).toBe(true)
    expect(openToTheDue('HEAD', '/projects/x')).toBe(true)
    expect(openToTheDue('POST', '/projects/x/export')).toBe(true)
    expect(openToTheDue('POST', '/projects/x/export/more')).toBe(false)
    expect(openToTheDue('POST', '/projects')).toBe(false)
    expect(openToTheDue('PATCH', '/me/name')).toBe(false)
    expect(openToTheDue('PUT', '/me/ai-key')).toBe(false)
  })
})

describe('the box runs with the beta terms (#1272)', () => {
  it('has the beta\'s first version in its register, material, and the server is started with it', () => {
    expect(TERMS[0]).toMatchObject({ material: true })
    expect(TERMS.length).toBeGreaterThan(0)
    // `createServer` without a register has no terms, as one without `auth` has no accounts; the box
    // is the one place that runs with them.
    expect(readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8')).toMatch(/createServer\(\{[^}]*\bterms: TERMS\b/)
  })
})

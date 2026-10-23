import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, PostgresLogStore, type AuthStore, type LogStore, type SurveyStore } from '../src/index.js'
import type { ProjectStore } from '../src/projects.js'
import type { Playtest } from '../src/playtest.js'
import { WireClient } from './client.js'
import { template } from './deck.js'
import { registerRoom, start, twoSeatSetup, type Running } from './fixture.js'

// The designer reads a game's playtest in one answer (#1010): `GET /projects/:id/playtest`, per
// table its answers, flags and people, per version its counts and distribution. It is the
// project's playtest data, so it is read by exactly those who may read a table's log and its
// surveys (#524): whoever may start the game's tables. A viewer — the one role without that right —
// is refused, as is a stranger and someone not logged in.
//
// Against the memory stores and against Postgres, whose queries are the ones the box answers with.
// The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_playtest_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; surveys: SurveyStore; projects: ProjectStore; auth: AuthStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ store: new MemoryLogStore(), surveys: new MemorySurveyStore(), projects: new MemoryProjectStore(), auth: new MemoryAuthStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        store,
        surveys: store.surveys(),
        projects: store.projects(),
        auth: store.auth(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const game = () => {
  const { zones, seats, floor } = twoSeatSetup()
  return { name: 'Skogens herrar', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 6 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}
let games = 0

for (const backend of backends) {
  describe.skipIf(backend.skip)(`a game’s playtest, in ${backend.name} (#1010)`, () => {
    let db: Backend
    let run: Running
    beforeAll(async () => {
      db = await backend.open()
      run = await start({ store: db.store, surveys: db.surveys, projects: db.projects, auth: db.auth })
    })
    afterAll(async () => {
      await run.stop()
      await db.close()
    })

    const login = async (email: string): Promise<string> => {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      return ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    }
    const as = (cookie: string | null) => (method: string, path: string, body?: unknown) =>
      fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    const shareWith = async (owner: ReturnType<typeof as>, project: string, email: string, role: string): Promise<string> => {
      await owner('POST', `/projects/${project}/invites`, { email, role })
      const link = /\/invites\/([A-Za-z0-9_-]+)/.exec(run.mail.sent.at(-1)?.text ?? '')?.[1] ?? ''
      const theirs = await login(email)
      await as(theirs)('POST', `/invites/${link}`)
      return theirs
    }

    it('hands the owner every table’s answers, flags and people, and every version’s sums', async () => {
      const owner = as(await login(`ada-${++games}@example.com`))
      const project = `p-${process.pid}-${games}`
      await owner('POST', '/projects', { id: project, ...game() })
      const table = (await (await owner('POST', `/projects/${project}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
      registerRoom(table.id, table)
      const tokens = { ada: await run.admit(table.id, 'A', 'Ada'), bo: await run.admit(table.id, 'B', 'Bo'), cilla: await run.admit(table.id, null, 'Cilla') }
      await run.admit(table.id, null, 'Dan')
      const ada = await WireClient.connect(run.base, table.id, 'A', undefined, { token: tokens.ada })
      const bo = await WireClient.connect(run.base, table.id, 'B', undefined, { token: tokens.bo })
      const cilla = await WireClient.connect(run.base, table.id, null, { role: 'observer', name: 'Cilla' }, { token: tokens.cilla })
      await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
      await bo.send('B', { v: 'seat.claim', seat: 'B', name: 'Bo' })
      await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
      await ada.send('A', { v: 'flag', note: 'Draken är för stark' })
      await bo.send('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
      await cilla.send(null, { v: 'flag' })
      await ada.send('A', { v: 'session.end' })
      for (const c of [ada, bo, cilla]) await c.close()
      const answer = (token: string, seat: string | null, fun: number, change: string) =>
        as(null)('POST', `/sessions/${table.id}/survey`, { token, seat, ...(seat === null ? { observer: true } : {}), answers: { fun, clarity: 3, balance: 4, change } })
      expect((await answer(tokens.ada, 'A', 4, 'Kortare runda')).status).toBe(201)
      expect((await answer(tokens.cilla, null, 5, 'Roligt att titta på')).status).toBe(201)

      const res = await owner('GET', `/projects/${project}/playtest`)
      expect(res.status).toBe(200)
      const read = (await res.json()) as Playtest
      expect(read.tables).toEqual([
        {
          id: table.id,
          code: table.code,
          version: 'rev-1',
          ended: true,
          endedAt: expect.any(String),
          moves: 2,
          people: [
            { name: 'Ada', seat: 'A', observer: false },
            { name: 'Bo', seat: 'B', observer: false },
            { name: 'Cilla', seat: null, observer: true },
            { name: 'Dan', seat: null, observer: true },
          ],
          answers: expect.arrayContaining([
            { who: 'Ada', seat: 'A', observer: false, at: expect.any(String), answers: { fun: 4, clarity: 3, balance: 4, change: 'Kortare runda' } },
            { who: 'Cilla', seat: null, observer: true, at: expect.any(String), answers: { fun: 5, clarity: 3, balance: 4, change: 'Roligt att titta på' } },
          ]),
          flags: [
            { who: 'Ada', seat: 'A', observer: false, note: 'Draken är för stark', at: expect.any(String), move: 1, version: 'rev-1' },
            { who: 'Cilla', seat: null, observer: true, note: '', at: expect.any(String), move: 2, version: 'rev-1' },
          ],
        },
      ])
      expect(read.versions).toEqual([{ version: 'rev-1', ended: 1, running: 0, players: 2, answered: 1, observers: 1, flags: 2, distribution: { fun: [0, 0, 0, 1, 0], clarity: [0, 0, 1, 0, 0], balance: [0, 0, 0, 1, 0] } }])
    })

    // A flag about a card (#1142) is read with the card's textures in the version it was raised on —
    // the very hashes the table handed the flagger — and with how the game's newest version differs.
    it('reads a flag about a card with the textures the table showed, and says when the row has changed since', async () => {
      const owner = as(await login(`eva-${++games}@example.com`))
      const project = `p-${process.pid}-${games}`
      await owner('POST', '/projects', { id: project, ...game() })
      const table = (await (await owner('POST', `/projects/${project}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
      registerRoom(table.id, table)
      const ada = await WireClient.connect(run.base, table.id, 'A', undefined, { token: await run.admit(table.id, 'A', 'Ada') })
      await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
      await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
      const held = ada.view!.components.find((c) => c.zone === 'hand:A')!
      await ada.send('A', { v: 'flag', component: held.id, note: 'Drake? Draken!' })
      await ada.send('A', { v: 'session.end' })
      await ada.close()

      const flagged = async () => ((await (await owner('GET', `/projects/${project}/playtest`)).json()) as Playtest).tables[0]!.flags[0]!.card
      expect(await flagged()).toMatchObject({ id: held.id, cardRef: 'dragon', title: 'Drake', faces: held.faces, seen: 'front', place: { zone: 'Hand', kind: 'hand', owner: 'Ada' }, now: 'same' })
      expect((await owner('PUT', `/projects/${project}`, { rev: 1, ...game(), rows: [{ id: 'dragon', fields: { title: 'Draken', antal: 6 } }] })).status).toBe(200)
      expect(await flagged()).toMatchObject({ title: 'Drake', faces: held.faces, now: 'changed' })
    })

    it('is read by those who may start the game’s tables, and by nobody else', async () => {
      const ownerCookie = await login(`bo-${++games}@example.com`)
      const owner = as(ownerCookie)
      const project = `p-${process.pid}-${games}`
      await owner('POST', '/projects', { id: project, ...game() })
      const path = `/projects/${project}/playtest`
      const status = async (cookie: string | null) => (await as(cookie)('GET', path)).status
      expect(await status(ownerCookie)).toBe(200)
      expect(await status(await shareWith(owner, project, `editor-${games}@example.com`, 'editor'))).toBe(200)
      expect(await status(await shareWith(owner, project, `tester-${games}@example.com`, 'tester'))).toBe(200)
      expect(await status(await shareWith(owner, project, `viewer-${games}@example.com`, 'viewer'))).toBe(403)
      expect(await status(await login(`stranger-${games}@example.com`))).toBe(403)
      expect(await status(null)).toBe(401)
    })
  })
}

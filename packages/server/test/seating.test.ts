import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryAuthStore, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, PostgresLogStore, type AuthStore, type LogStore, type SurveyStore } from '../src/index.js'
import type { ProjectStore } from '../src/projects.js'
import { template } from './deck.js'
import { registerRoom, start, twoSeatSetup, type Running } from './fixture.js'

// Bordet minns hur ni sitter (#1286). Svaret på «Hur sitter ni?» skickas med när bordet startas
// och sparas på bordet, så att anslutningssidan kan erbjuda ett enda «Gå med»: bordet och handen
// vid ett bord där var och en sitter vid sin dator, handen vid ett bord runt en TV. Det är inget
// spelläge (C2): sessionen och vyrollerna är desamma, och svaret säger bara vilken vy en väg in
// leder till. Ett bord som startades utan svar — före #1286, eller genom den råa dörren — har
// inget, och sidan gör då som förut.
//
// Mot minnet och mot Postgres. Postgres-halvan körs bara med DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_seating_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; surveys: SurveyStore; projects: ProjectStore; auth: AuthStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'minnet', skip: false, open: async () => ({ store: new MemoryLogStore(), surveys: new MemorySurveyStore(), projects: new MemoryProjectStore(), auth: new MemoryAuthStore(), close: () => Promise.resolve() }) },
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
  return { name: 'Fredagskort', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 4 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
}

for (const backend of backends) {
  describe.skipIf(backend.skip)(`bordet minns hur ni sitter, i ${backend.name} (#1286)`, () => {
    let db: Backend
    let run: Running
    let owner: (method: string, path: string, body?: unknown) => Promise<Response>
    beforeAll(async () => {
      db = await backend.open()
      run = await start({ store: db.store, surveys: db.surveys, projects: db.projects, auth: db.auth })
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'vera@example.com' }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      owner = (method, path, body) => fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    })
    afterAll(async () => {
      await run.stop()
      await db.close()
    })

    let games = 0
    const project = async (): Promise<string> => {
      const id = `fredag-${++games}`
      expect((await owner('POST', '/projects', { id, ...game() })).status).toBe(201)
      return id
    }
    const table = async (id: string, body?: unknown) => {
      const res = await owner('POST', `/projects/${id}/sessions`, body)
      expect(res.status).toBe(201)
      const made = (await res.json()) as { id: string; code: string; hostKey: string; hostSeat?: string }
      registerRoom(made.id, made)
      return made
    }

    it('säger svaret till den som öppnar koden och till spelets bordslista', async () => {
      const id = await project()
      const computer = await table(id, { seating: 'computer' })
      const screen = await table(id, { seating: 'screen' })
      // The host of a table of computers is told the seat she sits down at; at a TV she sits nowhere.
      expect(computer.hostSeat).toBe('A')
      expect(screen.hostSeat).toBeUndefined()
      expect(await (await fetch(`${run.http}/rooms/${computer.code}`)).json()).toEqual({ session: computer.id, name: 'Fredagskort', seating: 'computer' })
      expect(await (await fetch(`${run.http}/rooms/${screen.code}`)).json()).toEqual({ session: screen.id, name: 'Fredagskort', seating: 'screen' })
      const listed = (await (await owner('GET', `/projects/${id}/sessions`)).json()) as { id: string; seating?: string }[]
      expect(Object.fromEntries(listed.map((t) => [t.id, t.seating]))).toEqual({ [computer.id]: 'computer', [screen.id]: 'screen' })
    })

    it('minns svaret när servern startar om', async () => {
      const id = await project()
      const made = await table(id, { seating: 'computer' })
      await run.restart()
      expect(await (await fetch(`${run.http}/rooms/${made.code}`)).json()).toMatchObject({ seating: 'computer' })
    })

    it('har inget svar för ett bord som startades utan', async () => {
      const id = await project()
      const bare = await table(id)
      const empty = await table(id, {})
      for (const made of [bare, empty]) {
        const found = (await (await fetch(`${run.http}/rooms/${made.code}`)).json()) as Record<string, unknown>
        expect(found).toEqual({ session: made.id, name: 'Fredagskort' })
      }
    })

    it('tar inte emot ett svar som inte finns', async () => {
      const id = await project()
      const res = await owner('POST', `/projects/${id}/sessions`, { seating: 'phone' })
      expect(res.status).toBe(400)
    })
  })
}

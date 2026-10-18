import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryLogStore, MemorySurveyStore, PostgresLogStore, type LogStore, type SurveyStore } from '../src/index.js'
import { createRoom, start, twoSeatSetup, type Running } from './fixture.js'

// Who answers the survey (G3, #1021): the one who sat at the seat or watched the table, proved by
// the admission she connected with — the same token, tried the same way the door tries it. The
// name and the seat are the admission's, never what the body says; and a seat or an observer has
// one answer per table, the latest, since a phone that forgot it had answered asks again.
//
// The same behaviour against the memory stores and against Postgres, whose unique keys are what
// hold it there. The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_survey_sender_${process.pid}_${Date.now()}`

type Backend = { store: LogStore; surveys: SurveyStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ store: new MemoryLogStore(), surveys: new MemorySurveyStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema })
      await store.migrate()
      return {
        store,
        surveys: store.surveys(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

const answers = { fun: 4, clarity: 3, balance: 5, change: 'Draken är för stark' }
let tables = 0

for (const backend of backends) {
  describe.skipIf(backend.skip)(`who answers the survey, in ${backend.name} (G3, #1021)`, () => {
    let db: Backend
    let run: Running
    beforeAll(async () => {
      db = await backend.open()
      run = await start({ store: db.store, surveys: db.surveys })
    })
    afterAll(async () => {
      await run.stop()
      await db.close()
    })

    const post = (path: string, body: unknown) => fetch(`${run.http}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    // A table of its own per test, played by Ada at A and Bo at B and watched by Cilla, then ended.
    const ended = async () => {
      const { id, hostKey } = await createRoom(run.http, `survey-${process.pid}-${++tables}`)
      const ada = await run.admit(id, 'A', 'Ada')
      const bo = await run.admit(id, 'B', 'Bo')
      const cilla = await run.admit(id, null, 'Cilla')
      const table = await run.connectTable(id, hostKey)
      await table.send(null, { v: 'session.end' })
      await table.close()
      return { id, ada, bo, cilla }
    }

    it('takes a seat’s answer under the admission’s name and seat, not the body’s', async () => {
      const { id, ada } = await ended()
      expect((await post(`/sessions/${id}/survey`, { token: ada, who: 'Bo', seat: 'A', answers })).status).toBe(201)
      expect(await db.surveys.list(id)).toEqual([expect.objectContaining({ who: 'Ada', seat: 'A', answers })])
    })

    it('refuses a token that admits nobody, and an answer for someone else’s seat', async () => {
      const { id, bo, cilla } = await ended()
      expect((await post(`/sessions/${id}/survey`, { token: 'not-a-token', seat: 'A', answers })).status).toBe(403)
      expect((await post(`/sessions/${id}/survey`, { token: bo, seat: 'A', answers })).status).toBe(403)
      expect((await post(`/sessions/${id}/survey`, { token: cilla, seat: 'A', answers })).status).toBe(403)
      expect((await post(`/sessions/${id}/survey`, { seat: 'A', who: 'Ada', answers })).status).toBe(403)
      expect(await db.surveys.list(id)).toEqual([])
    })

    it('keeps one answer per seat, the latest, the way a phone that forgot it answered asks again', async () => {
      const { id, ada, bo } = await ended()
      expect((await post(`/sessions/${id}/survey`, { token: ada, seat: 'A', answers })).status).toBe(201)
      expect((await post(`/sessions/${id}/survey`, { token: bo, seat: 'B', answers })).status).toBe(201)
      const again = { ...answers, fun: 1, change: 'Jag ångrade mig' }
      expect((await post(`/sessions/${id}/survey`, { token: ada, seat: 'A', answers: again })).status).toBe(201)
      const kept = await db.surveys.list(id)
      expect(kept).toHaveLength(2)
      expect(kept.find((s) => s.seat === 'A')?.answers).toEqual(again)
      expect(kept.find((s) => s.seat === 'B')?.answers).toEqual(answers)
    })

    it('takes the observer’s answer under her admission, marked, once', async () => {
      const { id, cilla } = await ended()
      expect((await post(`/sessions/${id}/survey`, { token: cilla, who: 'Ada', seat: null, observer: true, answers })).status).toBe(201)
      expect((await post(`/sessions/${id}/survey`, { token: cilla, seat: null, observer: true, answers: { ...answers, balance: 1 } })).status).toBe(201)
      expect(await db.surveys.list(id)).toEqual([expect.objectContaining({ who: 'Cilla', seat: null, observer: true, answers: { ...answers, balance: 1 } })])
    })

    it('refuses the token of a seat that was kicked, as the door does', async () => {
      const { id, hostKey } = await createRoom(run.http, `survey-${process.pid}-${++tables}`)
      const ada = await run.admit(id, 'A', 'Ada')
      await run.store.revokeGuests(id, 'A', new Date().toISOString())
      const table = await run.connectTable(id, hostKey)
      await table.send(null, { v: 'session.end' })
      await table.close()
      expect((await post(`/sessions/${id}/survey`, { token: ada, seat: 'A', answers })).status).toBe(403)
    })
  })
}

// A database from before the keys (#1021): the same seat answered three times and the same
// observer twice. The migration leaves the latest of each, and then the keys can stand.
describe.skipIf(!url)('the survey keys arriving on a database that has answers twice (#1021)', () => {
  let store: PostgresLogStore
  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema: `${schema}_before` })
    await store.migrate()
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  it('keeps the latest answer of each seat and each observer, and nothing else', async () => {
    const sql = (store as unknown as { sql: import('postgres').Sql }).sql
    await sql`drop index surveys_seat`
    await sql`drop index surveys_observer`
    await store.createSession({ id: 'old', version: 'v1', setup: twoSeatSetup() })
    const row = (at: string, who: string, seat: string | null, fun: number) =>
      sql`insert into surveys (session_id, version, at, who, seat, observer, answers) values ('old', 'v1', ${at}, ${who}, ${seat}, ${seat === null}, ${sql.json({ ...answers, fun })})`
    await row('2026-10-01T12:00:00Z', 'Ada', 'A', 1)
    await row('2026-10-01T12:05:00Z', 'Någon', 'A', 2)
    await row('2026-10-01T12:03:00Z', 'Ada', 'A', 3)
    await row('2026-10-01T12:00:00Z', 'Bo', 'B', 4)
    await row('2026-10-01T12:00:00Z', 'Cilla', null, 1)
    await row('2026-10-01T12:01:00Z', 'Cilla', null, 5)
    await row('2026-10-01T12:00:00Z', 'Dan', null, 3)

    await store.migrate()

    const kept = (await store.surveys().list('old')).map((s) => `${s.who} ${s.seat ?? '-'} ${s.answers.fun}`)
    expect(kept.sort()).toEqual(['Bo B 4', 'Cilla - 5', 'Dan - 3', 'Någon A 2'])
    await expect(row('2026-10-01T13:00:00Z', 'Ada', 'A', 1)).rejects.toThrow(/surveys_seat/)
  })
})

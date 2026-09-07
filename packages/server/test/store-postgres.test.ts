import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore, SeqConflictError } from '../src/index.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import { SCHEMA_VERSION, type Applied } from '@byd/protocol'
import postgres from 'postgres'

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
// In a schema of its own, so a stack running against the same database is never touched.
const url = process.env['DATABASE_URL']
const schema = `test_server_${process.pid}_${Date.now()}`

describe.skipIf(!url)('PostgresLogStore', () => {
  let store: PostgresLogStore
  const id = `t-${Date.now()}`

  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    await store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  const line = (seq: number): Applied => ({
    schemaVersion: SCHEMA_VERSION,
    seq,
    batch: `b${seq}`,
    at: '2026-09-06T00:00:00.000Z',
    by: null,
    intent: { v: 'draw', from: 'draw', to: 'table', count: 1 },
  })

  it('round-trips the session and appends in order', async () => {
    expect(await store.loadSession(id)).toMatchObject({ id, version: 'v1' })
    await store.append(id, [line(1), line(2)])
    expect((await store.read(id)).map((l) => l.seq)).toEqual([1, 2])
  })

  it('refuses a gap or an overlap', async () => {
    await expect(store.append(id, [line(4)])).rejects.toBeInstanceOf(SeqConflictError)
    await expect(store.append(id, [line(2)])).rejects.toBeInstanceOf(SeqConflictError)
    expect((await store.read(id)).map((l) => l.seq)).toEqual([1, 2])
  })

  it('a row from before versioning is lifted to today\'s schema when read, and never rewritten (DRIFT §7)', async () => {
    const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: schema } })
    try {
      await sql`insert into events (session_id, seq, batch, at, by_seat, intent, outcome) values (${id}, 3, 'legacy', '2026-09-06T00:00:00.000Z', 'A', ${sql.json({ v: 'flag', note: 'gammal' })}, null)`
      const read = await store.read(id)
      expect(read.at(-1)).toEqual({ schemaVersion: SCHEMA_VERSION, seq: 3, batch: 'legacy', at: '2026-09-06T00:00:00.000Z', by: 'A', intent: { v: 'flag', note: 'gammal' } })
      const [row] = await sql<{ schema_version: number | null }[]>`select schema_version from events where session_id = ${id} and seq = 3`
      expect(row?.schema_version).toBeNull()
      const [written] = await sql<{ schema_version: number | null }[]>`select schema_version from events where session_id = ${id} and seq = 1`
      expect(written?.schema_version).toBe(SCHEMA_VERSION)
    } finally {
      await sql.end()
    }
  })
})

describe.skipIf(!url)('PostgresProjectStore', () => {
  it('creates, loads, replaces with optimistic concurrency', async () => {
    const store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const projects = store.projects()
    const id = `p-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    const doc = { name: 'Test', template, rows: [{ id: 'a', fields: { title: 'A' } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
    expect((await projects.create(id, doc)).rev).toBe(1)
    expect((await projects.load(id))?.name).toBe('Test')
    expect(await projects.replace(id, 5, doc)).toBe('conflict')
    const next = await projects.replace(id, 1, { ...doc, name: 'Test 2' })
    expect(next).toMatchObject({ rev: 2, name: 'Test 2' })
    expect(await projects.replace('nope', 1, doc)).toBe('missing')
    await store.close()
  })
})

describe.skipIf(!url)('project row order survives storage', () => {
  it('keeps the rows in the order they were written, including numeric-looking ids', async () => {
    const store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
    const projects = store.projects()
    const id = `order-${Date.now()}`
    const { zones, seats, floor } = twoSeatSetup()
    const rows = [
      { id: 'zeta', fields: { title: 'Z' } },
      { id: '10', fields: { title: 'Ten' } },
      { id: 'alpha', fields: { title: 'A' } },
      { id: '2', fields: { title: 'Two' } },
    ]
    await projects.create(id, { name: 'Order', template, rows, icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
    expect((await projects.load(id))?.rows.map((r) => r.id)).toEqual(['zeta', '10', 'alpha', '2'])
    await store.close()
  })
})

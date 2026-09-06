import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore, SeqConflictError } from '../src/index.js'
import { template } from './deck.js'
import { twoSeatSetup } from './fixture.js'
import type { Applied } from '@byd/protocol'

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']

describe.skipIf(!url)('PostgresLogStore', () => {
  let store: PostgresLogStore
  const id = `t-${Date.now()}`

  beforeAll(async () => {
    store = PostgresLogStore.connect(url!)
    await store.migrate()
    await store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
  })
  afterAll(async () => {
    await store.close()
  })

  const line = (seq: number): Applied => ({
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
})

describe.skipIf(!url)('PostgresProjectStore', () => {
  it('creates, loads, replaces with optimistic concurrency', async () => {
    const store = PostgresLogStore.connect(url!)
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
    const store = PostgresLogStore.connect(url!)
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

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore, SeqConflictError } from '../src/index.js'
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

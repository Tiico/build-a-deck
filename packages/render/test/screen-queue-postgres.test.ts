import { afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { FAKE_CLASSIFIER } from '@byd/screening'
import { PostgresRenderStore } from '../src/store-postgres.js'
import { screenRequest } from '../src/screen.js'
import { screenQueueBehaviour } from './screen-behaviour.js'

// The same behaviour against a real Postgres: DATABASE_URL=postgres://... pnpm test. Each test has
// a schema of its own, so it starts from an empty queue and never meets a stack's jobs.
const url = process.env['DATABASE_URL']

describe.skipIf(!url)('screening i Postgres', () => {
  const opened: PostgresRenderStore[] = []
  afterAll(async () => {
    for (const store of opened) {
      await store.dropSchema()
      await store.close()
    }
  })
  screenQueueBehaviour('i Postgres', async () => {
    const store = PostgresRenderStore.connect(url!, undefined, { schema: `test_screen_${process.pid}_${Date.now()}_${opened.length}` })
    opened.push(store)
    await store.migrate()
    return store
  })
})

describe.skipIf(!url)('en kö från före screeningen', () => {
  it('tar emot jobbslaget screen när den migrerats, och inget annat nytt', async () => {
    const schema = `test_screen_old_${process.pid}_${Date.now()}`
    const store = PostgresRenderStore.connect(url!, undefined, { schema })
    const sql = postgres(url!, { max: 1, onnotice: () => undefined, connection: { search_path: schema } })
    try {
      // The queue as the box has it: the priorities held by a check without `screen`.
      await sql.unsafe(`create schema "${schema}"`)
      await sql.unsafe(`create table render_jobs (hash text primary key, kind jsonb not null, priority text not null check (priority in ('texture', 'print')), compiled jsonb not null, requested_at bigint not null, state text not null check (state in ('queued', 'running', 'done', 'failed')), error text, started_at bigint)`)
      await sql`insert into render_jobs (hash, kind, priority, compiled, requested_at, state) values ('old', '{"kind":"pdf"}', 'print', '{"html":"","css":""}', 1, 'queued')`
      await store.migrate()
      await store.migrate()
      expect(await store.enqueue(screenRequest('c'.repeat(64), FAKE_CLASSIFIER, 2))).toBe('queued')
      expect((await store.claim(3))?.hash).toBe('old')
      await expect(sql`insert into render_jobs (hash, kind, priority, compiled, requested_at, state) values ('bad', '{"kind":"pdf"}', 'whenever', '{"html":"","css":""}', 1, 'queued')`).rejects.toThrow()
    } finally {
      await sql.end()
      await store.dropSchema()
      await store.close()
    }
  })
})

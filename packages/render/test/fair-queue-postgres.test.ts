import { afterAll, beforeAll, describe } from 'vitest'
import { PostgresRenderStore } from '../src/store-postgres.js'
import { fairQueueBehaviour } from './fair-queue-behaviour.js'

// Runs only against a real Postgres, in a schema of its own, so that no other test's jobs are in
// the queue it drains: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']
const schema = `test_fair_${process.pid}_${Date.now()}`

describe.skipIf(!url)('the render queue in Postgres takes turns between tables (#1546)', () => {
  let store: PostgresRenderStore
  beforeAll(async () => {
    store = PostgresRenderStore.connect(url!, undefined, { schema })
    await store.migrate()
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })
  fairQueueBehaviour(() => store, `pg${Date.now()}`)
})

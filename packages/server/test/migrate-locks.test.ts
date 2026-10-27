import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore } from '../src/store-postgres.js'

// The app's schema at a start takes no lock a write waits for when it is already current (#1442):
// 001-init.sql ran at every start, and its `alter table … add column if not exists`, `alter column
// … set not null` and `create index if not exists` locked the tables they name whatever the schema
// already said, so a start beside writes could wait on them or die in a deadlock (40P01), as the
// render worker did. Runs only with DATABASE_URL=postgres://...
const url = process.env['DATABASE_URL']
const schema = `test_app_migrate_locks_${process.pid}_${Date.now()}`
// Every table the script makes, read out of it, so that a table added later is held here too.
const TABLES = [...readFileSync(new URL('../sql/001-init.sql', import.meta.url), 'utf8').matchAll(/create table (?:if not exists )?(\w+)/g)].map((m) => m[1]!)

const within = <T>(ms: number, what: string, p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms))])

describe.skipIf(!url)('the app schema at a start (#1442)', () => {
  let first: PostgresLogStore
  let sql: postgres.Sql
  beforeAll(async () => {
    first = PostgresLogStore.connect(url!, { schema })
    await first.migrate()
    sql = postgres(url!, { max: 2, onnotice: () => undefined, connection: { search_path: schema } })
  })
  afterAll(async () => {
    await sql?.end()
    await first?.dropSchema()
    await first?.close()
  })

  it('reads every table the script makes', () => {
    expect(TABLES).toContain('sessions')
    expect(TABLES).toContain('project_assets')
    expect(TABLES).toContain('gone_games')
  })

  it('migrates a current schema while every table it owns is being written', async () => {
    const started = PostgresLogStore.connect(url!, { schema })
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let locked!: () => void
    const isLocked = new Promise<void>((resolve) => (locked = resolve))
    // The lock every insert and update takes, held on all of them for as long as the start runs.
    const writing = sql.begin(async (tx) => {
      await tx.unsafe(`lock table ${TABLES.join(', ')} in row exclusive mode`)
      locked()
      await held
    })
    try {
      await isLocked
      await within(5_000, 'the start', started.migrate())
    } finally {
      release()
      await writing
      await started.close()
    }
  })
})

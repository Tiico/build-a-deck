import postgres from 'postgres'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { migrate } from '../src/migrate.js'
import { PostgresRenderStore } from '../src/store-postgres.js'
import type { RenderRequest } from '../src/store.js'

// A start against a current schema takes no lock that a write waits for (#1442). The worker ran
// 001-render.sql at every start, and its `alter table … drop not null` and `create index if not
// exists` locked the queue's tables whatever the schema already said; a start beside the app's
// writes then died in a deadlock (40P01). Runs only with DATABASE_URL=postgres://...
const url = process.env['DATABASE_URL']
const schema = `test_migrate_locks_${process.pid}_${Date.now()}`
const TABLES = ['render_jobs', 'render_outputs', 'render_log', 'screenings', 'screening_references']

const within = <T>(ms: number, what: string, p: Promise<T>): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} did not finish within ${ms} ms`)), ms))])

describe.skipIf(!url)('the render schema at a start (#1442)', () => {
  let first: PostgresRenderStore
  let sql: postgres.Sql
  beforeAll(async () => {
    first = PostgresRenderStore.connect(url!, undefined, { schema })
    await first.migrate()
    sql = postgres(url!, { max: 4, onnotice: () => undefined, connection: { search_path: schema } })
  })
  afterAll(async () => {
    await sql?.end()
    await first?.dropSchema()
    await first?.close()
  })

  it('migrates a current schema while every table it owns is being written', async () => {
    const started = PostgresRenderStore.connect(url!, undefined, { schema })
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

  it('lets two workers start at once beside the queue’s own writes, and neither dies', async () => {
    let n = 0
    const page = (): RenderRequest => ({ hash: `${schema}-${++n}`, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: `<p>${n}</p>`, css: '' }, requestedAt: n })
    let stop = false
    // The app's enqueue and the worker's complete, back to back: each reads or writes the outputs
    // and then the jobs, the order a start's script would lock them the other way round in.
    const writer = async () => {
      while (!stop) {
        const req = page()
        await first.enqueue(req, 'ada')
        const job = await first.claim(Date.now())
        if (job) await first.complete(job.hash, new Uint8Array([1, 2, 3]))
      }
    }
    const writers = [writer(), writer(), writer()]
    try {
      for (let round = 0; round < 5; round++) {
        const a = PostgresRenderStore.connect(url!, undefined, { schema })
        const b = PostgresRenderStore.connect(url!, undefined, { schema })
        try {
          await within(10_000, 'two starts', Promise.all([a.migrate(), b.migrate()]))
        } finally {
          await a.close()
          await b.close()
        }
      }
    } finally {
      stop = true
      await Promise.all(writers)
    }
  })

  it('lets two workers make a fresh schema at once', async () => {
    const fresh = `${schema}_fresh`
    const a = PostgresRenderStore.connect(url!, undefined, { schema: fresh })
    const b = PostgresRenderStore.connect(url!, undefined, { schema: fresh })
    try {
      await within(10_000, 'two first starts', Promise.all([a.migrate(), b.migrate()]))
      expect(await a.enqueue({ hash: 'x', kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: '', css: '' }, requestedAt: 1 })).toBe('queued')
    } finally {
      await a.dropSchema()
      await a.close()
      await b.close()
    }
  })

  it('tries a changed script again when Postgres picks it as a deadlock’s victim', async () => {
    await sql.unsafe('create table if not exists victim_a (n int); create table if not exists victim_b (n int)')
    const script = 'lock table victim_a in access exclusive mode; lock table victim_b in access exclusive mode;'
    let release!: () => void
    const go = new Promise<void>((resolve) => (release = resolve))
    let holding!: () => void
    const holds = new Promise<void>((resolve) => (holding = resolve))
    // A write that holds b and then wants a: the other way round from the script.
    // Postgres aborts whichever waiter's deadlock check runs first, and with both on the default
    // second the start's lead was only the ~10 ms of the poll below; a release gate under load saw
    // the write's check run first and the write die (#1465). The write waits ten seconds before it
    // checks, so the start's check is the one that finds the cycle.
    const write = sql.begin(async (tx) => {
      await tx`set local deadlock_timeout = '10s'`
      await tx`lock table victim_b in row exclusive mode`
      holding()
      await go
      await tx`lock table victim_a in row exclusive mode`
    })
    await holds
    const start = migrate(sql, 'test/victim.sql', script, schema)
    // Once the start has a and waits for b, the write asks for a: the start waited first, so its
    // deadlock check fires first and it is the one Postgres aborts.
    for (let i = 0; i < 200; i++) {
      const [row] = await sql<{ n: number }[]>`select count(*)::int as n from pg_locks where relation = 'victim_b'::regclass and not granted`
      if (row!.n > 0) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    release()
    await write
    expect(await within(15_000, 'the start', start)).toBe('migrated')
  })
})

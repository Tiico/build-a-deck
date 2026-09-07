import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import type { RenderKind } from './hash.js'
import type { ClaimedJob, EnqueueResult, JobStatus, RenderRequest, RenderStore } from './store.js'

type Row = {
  hash: string
  kind: RenderKind
  priority: 'texture' | 'print'
  compiled: { html: string; css: string }
  requested_at: string | number
  state: 'queued' | 'running' | 'done' | 'failed'
  error: string | null
  started_at: string | number | null
}

// The queue in Postgres: `claim` takes the next queued row with SKIP LOCKED, so several
// workers never take the same job, and the whole thing is backed up with the log (DRIFT §5).
export class PostgresRenderStore implements RenderStore {
  constructor(private readonly sql: postgres.Sql) {}

  static connect(url: string): PostgresRenderStore {
    return new PostgresRenderStore(postgres(url, { max: 3, onnotice: () => undefined }))
  }

  async migrate(): Promise<void> {
    await this.sql.unsafe(await readFile(fileURLToPath(new URL('../sql/001-render.sql', import.meta.url)), 'utf8'))
  }

  async close(): Promise<void> {
    await this.sql.end()
  }

  async enqueue(req: RenderRequest): Promise<EnqueueResult> {
    return this.sql.begin(async (tx) => {
      const cached = await tx`select 1 from render_outputs where hash = ${req.hash}`
      if (cached.length > 0) return 'cached'
      const [existing] = await tx<{ state: Row['state'] }[]>`select state from render_jobs where hash = ${req.hash} for update`
      if (existing && (existing.state === 'queued' || existing.state === 'running')) return 'queued-already'
      await tx`
        insert into render_jobs (hash, kind, priority, compiled, requested_at, state)
        values (${req.hash}, ${tx.json(req.kind)}, ${req.priority}, ${tx.json(req.compiled)}, ${req.requestedAt}, 'queued')
        on conflict (hash) do update
          set kind = excluded.kind, priority = excluded.priority, compiled = excluded.compiled,
              requested_at = excluded.requested_at, state = 'queued', error = null, started_at = null
      `
      return 'queued'
    })
  }

  async claim(now: number): Promise<ClaimedJob | null> {
    const [row] = await this.sql<Row[]>`
      update render_jobs set state = 'running', started_at = ${now}, error = null
      where hash = (
        select hash from render_jobs where state = 'queued'
        order by (priority = 'print'), requested_at
        limit 1 for update skip locked
      )
      returning *
    `
    if (!row) return null
    return { hash: row.hash, kind: row.kind, priority: row.priority, compiled: row.compiled, requestedAt: Number(row.requested_at), startedAt: now }
  }

  async complete(hash: string, output: Uint8Array): Promise<void> {
    await this.sql.begin(async (tx) => {
      await tx`insert into render_outputs (hash, bytes) values (${hash}, ${Buffer.from(output)}) on conflict (hash) do update set bytes = excluded.bytes`
      await tx`update render_jobs set state = 'done' where hash = ${hash}`
    })
  }

  async fail(hash: string, error: string): Promise<void> {
    await this.sql`update render_jobs set state = 'failed', error = ${error} where hash = ${hash}`
  }

  async status(hash: string): Promise<JobStatus | null> {
    const [row] = await this.sql<Pick<Row, 'state' | 'error' | 'started_at'>[]>`select state, error, started_at from render_jobs where hash = ${hash}`
    if (!row) {
      const out = await this.sql`select 1 from render_outputs where hash = ${hash}`
      return out.length > 0 ? { state: 'done' } : null
    }
    const s: JobStatus = { state: row.state }
    if (row.error !== null) s.error = row.error
    if (row.started_at !== null) s.startedAt = Number(row.started_at)
    return s
  }

  async requeue(hash: string): Promise<boolean> {
    const rows = await this.sql`
      update render_jobs set state = 'queued', error = null, started_at = null
      where hash = ${hash} and state = 'failed'
      returning hash
    `
    return rows.length > 0
  }

  async output(hash: string): Promise<Uint8Array | null> {
    const [row] = await this.sql<{ bytes: Uint8Array }[]>`select bytes from render_outputs where hash = ${hash}`
    return row ? new Uint8Array(row.bytes) : null
  }

  async reap(olderThanMs: number, now: number): Promise<string[]> {
    const rows = await this.sql<{ hash: string }[]>`
      update render_jobs set state = 'queued', started_at = null
      where state = 'running' and started_at < ${now - olderThanMs}
      returning hash
    `
    return rows.map((r) => r.hash)
  }
}

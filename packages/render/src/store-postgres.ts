import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { ScreeningReference, ScreeningResult, type ClassifierRef } from '@byd/screening'
import type { RenderKind } from './hash.js'
import { contentTypeOf, outputKey, type ClaimedJob, type EnqueueResult, type Fit, type JobStatus, type Priority, type RenderRequest, type RenderStore, type ScreeningFailure } from './store.js'
import type { ObjectStore } from './objects.js'
import { assetKey, type AssetBytes, type AssetSource } from './assets.js'

type Row = {
  hash: string
  kind: RenderKind
  priority: Priority
  compiled: { html: string; css: string }
  requested_at: string | number
  state: 'queued' | 'running' | 'done' | 'failed'
  error: string | null
  started_at: string | number | null
}

// The queue in Postgres: `claim` takes the next queued row with SKIP LOCKED, so several
// workers never take the same job, and the whole thing is backed up with the log (DRIFT §5).
// With an object store (DRIFT §4) the outputs go there and Postgres keeps only that they exist;
// without one, the bytes stay in Postgres and are served through the app.
export class PostgresRenderStore implements RenderStore {
  constructor(
    private readonly sql: postgres.Sql,
    private readonly objects?: ObjectStore,
  ) {}

  // `schema` puts the tables in a schema of their own — a test run's, so it never shares a
  // queue with a stack running against the same database.
  static connect(url: string, objects?: ObjectStore, options: { schema?: string } = {}): PostgresRenderStore {
    const store = new PostgresRenderStore(postgres(url, { max: 3, onnotice: () => undefined, ...(options.schema ? { connection: { search_path: options.schema } } : {}) }), objects)
    store.schema = options.schema
    return store
  }
  private schema: string | undefined

  async migrate(): Promise<void> {
    if (this.schema) await this.sql.unsafe(`create schema if not exists "${this.schema.replace(/"/g, '')}"`)
    await this.sql.unsafe(await readFile(fileURLToPath(new URL('../sql/001-render.sql', import.meta.url)), 'utf8'))
  }

  // Drops a schema made for a test run.
  async dropSchema(): Promise<void> {
    if (this.schema) await this.sql.unsafe(`drop schema if exists "${this.schema.replace(/"/g, '')}" cascade`)
  }

  async close(): Promise<void> {
    await this.sql.end()
  }

  async enqueue(req: RenderRequest, bearer?: string): Promise<EnqueueResult> {
    return this.sql.begin(async (tx) => {
      const cached = await tx`select 1 from render_outputs where hash = ${req.hash}`
      if (cached.length > 0) return 'cached'
      if (req.kind.kind === 'screen') {
        const { asset, classifier } = req.kind
        const screened = await tx`select 1 from screenings where asset_hash = ${asset} and classifier = ${classifier.id} and version = ${classifier.version}`
        if (screened.length > 0) return 'cached'
      }
      const [existing] = await tx<{ state: Row['state'] }[]>`select state from render_jobs where hash = ${req.hash} for update`
      if (existing && (existing.state === 'queued' || existing.state === 'running')) return 'queued-already'
      await tx`
        insert into render_jobs (hash, kind, priority, compiled, requested_at, state)
        values (${req.hash}, ${tx.json(req.kind)}, ${req.priority}, ${tx.json(req.compiled)}, ${req.requestedAt}, 'queued')
        on conflict (hash) do update
          set kind = excluded.kind, priority = excluded.priority, compiled = excluded.compiled,
              requested_at = excluded.requested_at, state = 'queued', error = null, started_at = null
      `
      // In the transaction that queued the job (#1197), so a job is never queued unbilled nor billed unqueued.
      if (bearer !== undefined) await tx`insert into render_log (account_id, hash, priority, requested_at) values (${bearer}, ${req.hash}, ${req.priority}, ${req.requestedAt})`
      return 'queued'
    })
  }

  async rendersBy(bearer: string, since: number): Promise<number> {
    const [row] = await this.sql<{ n: number }[]>`select count(*)::int as n from render_log where account_id = ${bearer} and requested_at >= ${since}`
    return row?.n ?? 0
  }

  async claim(now: number): Promise<ClaimedJob | null> {
    const [row] = await this.sql<Row[]>`
      update render_jobs set state = 'running', started_at = ${now}, error = null
      where hash = (
        select hash from render_jobs where state = 'queued'
        order by case priority when 'texture' then 0 when 'print' then 1 else 2 end, requested_at
        limit 1 for update skip locked
      )
      returning *
    `
    if (!row) return null
    return { hash: row.hash, kind: row.kind, priority: row.priority, compiled: row.compiled, requestedAt: Number(row.requested_at), startedAt: now }
  }

  async complete(hash: string, output: Uint8Array, fit: Fit = { smallestPt: null }): Promise<void> {
    if (this.objects) {
      const [job] = await this.sql<Pick<Row, 'kind'>[]>`select kind from render_jobs where hash = ${hash}`
      await this.objects.put(outputKey(hash), output, contentTypeOf(job?.kind))
    }
    const bytes = this.objects ? null : Buffer.from(output)
    await this.sql.begin(async (tx) => {
      await tx`insert into render_outputs (hash, bytes, smallest_pt) values (${hash}, ${bytes}, ${fit.smallestPt}) on conflict (hash) do update set bytes = excluded.bytes, smallest_pt = excluded.smallest_pt`
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
    const [row] = await this.sql<{ bytes: Uint8Array | null }[]>`select bytes from render_outputs where hash = ${hash}`
    if (!row) return null
    if (row.bytes) return new Uint8Array(row.bytes)
    return this.objects ? this.objects.get(outputKey(hash)) : null
  }

  async forgetPagesNaming(asset: string): Promise<string[]> {
    const like = `%asset:${asset}%`
    const gone = await this.sql.begin(async (tx) => {
      const rows = await tx<{ hash: string }[]>`delete from render_jobs where compiled->>'html' like ${like} or compiled->>'css' like ${like} returning hash`
      const hashes = rows.map((r) => r.hash)
      if (hashes.length > 0) await tx`delete from render_outputs where hash in ${tx(hashes)}`
      return hashes
    })
    if (this.objects) for (const hash of gone) await this.objects.delete?.(outputKey(hash))
    return gone.sort()
  }

  async fitOf(hash: string): Promise<Fit | null> {
    const [row] = await this.sql<{ smallest_pt: number | null }[]>`select smallest_pt from render_outputs where hash = ${hash}`
    return row ? { smallestPt: row.smallest_pt === null ? null : Number(row.smallest_pt) } : null
  }

  async link(hash: string, ttlSeconds: number, disposition?: string): Promise<string | null> {
    if (!this.objects) return null
    const [row] = await this.sql<{ bytes: Uint8Array | null }[]>`select bytes from render_outputs where hash = ${hash}`
    return row && row.bytes === null ? this.objects.link(outputKey(hash), ttlSeconds, disposition) : null
  }

  // The pictures and typefaces a page names by hash (#1028), read from where the app keeps them.
  assets(): AssetSource {
    return { get: (hash) => assetFromPostgres(this.sql, this.objects, hash) }
  }

  async completeScreening(hash: string, result: ScreeningResult): Promise<void> {
    const kept = ScreeningResult.parse(result)
    await this.sql.begin(async (tx) => {
      const [job] = await tx<Pick<Row, 'kind'>[]>`select kind from render_jobs where hash = ${hash} for update`
      const kind = job?.kind
      if (kind?.kind !== 'screen' || kind.asset !== kept.asset || kind.classifier.id !== kept.classifier.id || kind.classifier.version !== kept.classifier.version) throw new Error(`job ${hash} is not a screening of ${kept.asset}`)
      // The first result is the result: a second for the same picture and version keeps it.
      await tx`
        insert into screenings (asset_hash, classifier, version, scores, image_hash, screened_at)
        values (${kept.asset}, ${kept.classifier.id}, ${kept.classifier.version}, ${tx.json(kept.scores)}, ${tx.json(kept.imageHash)}, ${kept.screenedAt})
        on conflict do nothing
      `
      await tx`update render_jobs set state = 'done' where hash = ${hash}`
    })
  }

  async screeningOf(asset: string, classifier: ClassifierRef): Promise<ScreeningResult | null> {
    const [row] = await this.sql<ScreeningRow[]>`select * from screenings where asset_hash = ${asset} and classifier = ${classifier.id} and version = ${classifier.version}`
    return row ? screeningOfRow(row) : null
  }

  async screenings(classifier: ClassifierRef): Promise<ScreeningResult[]> {
    const rows = await this.sql<ScreeningRow[]>`select * from screenings where classifier = ${classifier.id} and version = ${classifier.version} order by asset_hash`
    return rows.map(screeningOfRow)
  }

  async screeningFailures(classifier: ClassifierRef): Promise<ScreeningFailure[]> {
    return this.sql<ScreeningFailure[]>`
      select kind->>'asset' as asset, coalesce(error, '') as error from render_jobs
      where state = 'failed' and kind->>'kind' = 'screen'
        and kind->'classifier'->>'id' = ${classifier.id} and kind->'classifier'->>'version' = ${classifier.version}
      order by kind->>'asset'
    `.then((rows) => rows.map(({ asset, error }) => ({ asset, error })))
  }

  async addScreeningReference(reference: ScreeningReference): Promise<'added' | 'known'> {
    const { imageHash, source, addedAt } = ScreeningReference.parse(reference)
    const added = await this.sql`
      insert into screening_references (algorithm, bits, quality, source, added_at)
      values (${imageHash.algorithm}, ${imageHash.bits}, ${imageHash.quality ?? null}, ${source}, ${addedAt})
      on conflict do nothing
      returning 1
    `
    return added.length > 0 ? 'added' : 'known'
  }

  async screeningReferences(): Promise<ScreeningReference[]> {
    const rows = await this.sql<{ algorithm: 'pdq-256'; bits: string; quality: number | null; source: string; added_at: string | number }[]>`
      select * from screening_references order by added_at, bits
    `
    return rows.map((r) => ({ imageHash: { algorithm: r.algorithm, bits: r.bits, ...(r.quality === null ? {} : { quality: r.quality }) }, source: r.source, addedAt: Number(r.added_at) }))
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

type ScreeningRow = { asset_hash: string; classifier: string; version: string; scores: ScreeningResult['scores']; image_hash: ScreeningResult['imageHash']; screened_at: string | number }
const screeningOfRow = (row: ScreeningRow): ScreeningResult => ({
  asset: row.asset_hash,
  classifier: { id: row.classifier, version: row.version },
  scores: row.scores,
  imageHash: row.image_hash,
  screenedAt: Number(row.screened_at),
})

// One asset out of the app's `assets` table (DRIFT §4): the bytes are in the row without an
// object store, and under `assets/<hash>` in it with one. The app's store and the render worker
// both read through this, so the two cannot disagree about where a picture is.
export async function assetFromPostgres(sql: postgres.Sql, objects: ObjectStore | undefined, hash: string): Promise<AssetBytes | null> {
  // A picture blocked after a report (#1274) is not there for the worker either, whichever process
  // blocked it: a page queued before the block that still names it fails rather than draws it.
  const [row] = await sql<{ content_type: string; bytes: Uint8Array | null }[]>`
    select content_type, bytes from assets a where hash = ${hash}
      and not exists (select 1 from asset_blocks b where b.hash = a.hash)
  `
  if (!row) return null
  if (row.bytes) return { bytes: new Uint8Array(row.bytes), contentType: row.content_type }
  const bytes = objects ? await objects.get(assetKey(hash)) : null
  return bytes ? { bytes, contentType: row.content_type } : null
}

import { ScreeningReference, ScreeningResult, type ClassifierRef } from '@byd/screening'
import type { CompiledLike, RenderKind } from './hash.js'
import { MemoryObjectStore, type ObjectStore } from './objects.js'

// The render queue (DRIFT §6): jobs keyed by content hash, textures before prints and prints
// before screenings (#1271), oldest first, one worker at a time per job, and a reaper for jobs whose Chromium hung.
// Outputs are stored under the hash; a hash already rendered is a no-op forever. They live in
// an object store (DRIFT §4) — R2 on the box, memory in tests — under `renders/<hash>`.

export type Priority = 'texture' | 'print' | 'screen'
export type RenderRequest = { hash: string; kind: RenderKind; priority: Priority; compiled: CompiledLike; requestedAt: number }
export type JobState = 'queued' | 'running' | 'done' | 'failed'
export type JobStatus = { state: JobState; error?: string; startedAt?: number }
export type ClaimedJob = RenderRequest & { startedAt: number }
export type EnqueueResult = 'queued' | 'queued-already' | 'cached'
// What a texture's text was fitted to (#523): its smallest text in pt once E6 had fitted it, or
// null for a card with no words — and for every output made before this was kept.
export type Fit = { smallestPt: number | null }
// A screening that did not come to a result, and why (#1271): a picture that is not there, or
// that Chromium could not decode, with the hash in the error.
export type ScreeningFailure = { asset: string; error: string }

export type RenderStore = {
  // `bearer` is the account the rendering is counted against (#1197, A2): a page is content-addressed
  // and the queue keeps no owner, so who caused a rendering can only be written down as it is
  // queued. A job answered `queued` writes one line on the bearer in the render log, in the same
  // step as the job; `cached` and `queued-already` cost nothing and write nothing. Without a bearer
  // nobody is counted, as for a table from before accounts.
  enqueue(req: RenderRequest, bearer?: string): Promise<EnqueueResult>
  // How many jobs the bearer has had queued at or after `since` (ms, the clock of `requestedAt`):
  // the measure `rendersPer30Days`, read out of the render log.
  rendersBy(bearer: string, since: number): Promise<number>
  // The next job to run, marked running as of `now`; null when nothing is waiting.
  claim(now: number): Promise<ClaimedJob | null>
  complete(hash: string, output: Uint8Array, fit?: Fit): Promise<void>
  fail(hash: string, error: string): Promise<void>
  status(hash: string): Promise<JobStatus | null>
  // A job that failed goes back in the queue, keeping the compiled page it was made from;
  // false when there is no such job or it did not fail. The one way back from `failed`.
  requeue(hash: string): Promise<boolean>
  output(hash: string): Promise<Uint8Array | null>
  // Null until there is an output under the hash.
  fitOf(hash: string): Promise<Fit | null>
  // A URL a browser may fetch the finished output from directly for `ttlSeconds` (DRIFT §4);
  // null when there is no such output, or when the bytes have to come through the server. With
  // `disposition`, what the file is to be called when it is opened (#678).
  link(hash: string, ttlSeconds: number, disposition?: string): Promise<string | null>
  // Jobs running longer than `olderThanMs` as of `now` go back to the queue; returns their hashes.
  reap(olderThanMs: number, now: number): Promise<string[]>

  // Screening (F4, #1271). A job of the kind `screen` ends in a result and not an output: one per
  // picture, classifier and version, which is what makes a second job for the same `cached`. The
  // job is done in the step the result is kept, and `output` has nothing under it.
  completeScreening(hash: string, result: ScreeningResult): Promise<void>
  screeningOf(asset: string, classifier: ClassifierRef): Promise<ScreeningResult | null>
  // Every result of a classifier version, by picture.
  screenings(classifier: ClassifierRef): Promise<ScreeningResult[]>
  // The screenings of a classifier version that failed and have not been asked for again.
  screeningFailures(classifier: ClassifierRef): Promise<ScreeningFailure[]>
  // The reference list (F4, beslut 9; #1273): PDQ hashes of pictures that must not be printed, in
  // the database and never in the repo. A hash is listed once, with the source it was first listed
  // from; listing it again is `known` and changes nothing. Read in the order it was filled.
  addScreeningReference(reference: ScreeningReference): Promise<'added' | 'known'>
  screeningReferences(): Promise<ScreeningReference[]>

  // Every job and output whose page names this asset (`asset:<hash>`), taken out of the queue and the
  // bucket (#1274): what is drawn from a picture that has been blocked is not handed out under its old
  // hash, and a deck drawn without the picture has pages of other hashes. Says which hashes went. The
  // render log keeps its lines: what was rendered was rendered, and is counted.
  forgetPagesNaming(asset: string): Promise<string[]>
}

const RANK: Record<Priority, number> = { texture: 0, print: 1, screen: 2 }
const screeningKey = (asset: string, c: ClassifierRef) => `${asset}\n${c.id}@${c.version}`
const sameClassifier = (a: ClassifierRef, b: ClassifierRef) => a.id === b.id && a.version === b.version

export const outputKey = (hash: string): string => `renders/${hash}`
export function contentTypeOf(kind: RenderKind | undefined): string {
  switch (kind?.kind) {
    case 'pdf':
    case 'booklet':
      return 'application/pdf'
    case 'png':
      return 'image/png'
    case 'raster':
      return kind.format === 'jpg' ? 'image/jpeg' : 'image/png'
    default:
      return 'application/octet-stream'
  }
}

export class MemoryRenderStore implements RenderStore {
  private readonly jobs = new Map<string, RenderRequest & JobStatus>()
  private readonly outputs = new Map<string, Fit>()
  // The render log (#1197): who bore each job that was queued, and when it was asked for.
  private readonly log: { bearer: string; hash: string; at: number }[] = []
  private readonly screened = new Map<string, ScreeningResult>()
  private readonly references = new Map<string, ScreeningReference>()

  constructor(private readonly objects: ObjectStore = new MemoryObjectStore()) {}

  async enqueue(req: RenderRequest, bearer?: string): Promise<EnqueueResult> {
    if (this.outputs.has(req.hash)) return 'cached'
    if (req.kind.kind === 'screen' && this.screened.has(screeningKey(req.kind.asset, req.kind.classifier))) return 'cached'
    const existing = this.jobs.get(req.hash)
    if (existing && (existing.state === 'queued' || existing.state === 'running')) return 'queued-already'
    this.jobs.set(req.hash, { ...req, state: 'queued' })
    if (bearer !== undefined) this.log.push({ bearer, hash: req.hash, at: req.requestedAt })
    return 'queued'
  }

  async rendersBy(bearer: string, since: number): Promise<number> {
    return this.log.filter((line) => line.bearer === bearer && line.at >= since).length
  }

  async claim(now: number): Promise<ClaimedJob | null> {
    const next = [...this.jobs.values()]
      .filter((j) => j.state === 'queued')
      .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.requestedAt - b.requestedAt)[0]
    if (!next) return null
    next.state = 'running'
    next.startedAt = now
    delete next.error
    return { ...next, startedAt: now }
  }

  async complete(hash: string, output: Uint8Array, fit: Fit = { smallestPt: null }): Promise<void> {
    const job = this.jobs.get(hash)
    await this.objects.put(outputKey(hash), output, contentTypeOf(job?.kind))
    if (job) job.state = 'done'
    this.outputs.set(hash, fit)
  }

  async fitOf(hash: string): Promise<Fit | null> {
    return this.outputs.get(hash) ?? null
  }

  async fail(hash: string, error: string): Promise<void> {
    const job = this.jobs.get(hash)
    if (!job) return
    job.state = 'failed'
    job.error = error
  }

  async status(hash: string): Promise<JobStatus | null> {
    const job = this.jobs.get(hash)
    if (!job) return this.outputs.has(hash) ? { state: 'done' } : null
    const s: JobStatus = { state: job.state }
    if (job.error !== undefined) s.error = job.error
    if (job.startedAt !== undefined) s.startedAt = job.startedAt
    return s
  }

  async requeue(hash: string): Promise<boolean> {
    const job = this.jobs.get(hash)
    if (!job || job.state !== 'failed') return false
    job.state = 'queued'
    delete job.error
    delete job.startedAt
    return true
  }

  async output(hash: string): Promise<Uint8Array | null> {
    return this.outputs.has(hash) ? this.objects.get(outputKey(hash)) : null
  }

  async forgetPagesNaming(asset: string): Promise<string[]> {
    const ref = `asset:${asset}`
    const gone: string[] = []
    for (const [hash, job] of this.jobs) {
      if (!job.compiled.html.includes(ref) && !job.compiled.css.includes(ref)) continue
      this.jobs.delete(hash)
      this.outputs.delete(hash)
      await this.objects.delete?.(outputKey(hash))
      gone.push(hash)
    }
    return gone.sort()
  }

  async link(hash: string, ttlSeconds: number, disposition?: string): Promise<string | null> {
    return this.outputs.has(hash) ? this.objects.link(outputKey(hash), ttlSeconds, disposition) : null
  }

  async completeScreening(hash: string, result: ScreeningResult): Promise<void> {
    const kept = ScreeningResult.parse(result)
    const job = this.jobs.get(hash)
    if (job?.kind.kind !== 'screen' || job.kind.asset !== kept.asset || !sameClassifier(job.kind.classifier, kept.classifier)) throw new Error(`job ${hash} is not a screening of ${kept.asset}`)
    const key = screeningKey(kept.asset, kept.classifier)
    if (!this.screened.has(key)) this.screened.set(key, structuredClone(kept))
    job.state = 'done'
  }

  async screeningOf(asset: string, classifier: ClassifierRef): Promise<ScreeningResult | null> {
    const found = this.screened.get(screeningKey(asset, classifier))
    return found ? structuredClone(found) : null
  }

  async screenings(classifier: ClassifierRef): Promise<ScreeningResult[]> {
    return [...this.screened.values()].filter((r) => sameClassifier(r.classifier, classifier)).sort((a, b) => a.asset.localeCompare(b.asset)).map((r) => structuredClone(r))
  }

  async screeningFailures(classifier: ClassifierRef): Promise<ScreeningFailure[]> {
    const failed: ScreeningFailure[] = []
    for (const job of this.jobs.values()) if (job.kind.kind === 'screen' && job.state === 'failed' && sameClassifier(job.kind.classifier, classifier)) failed.push({ asset: job.kind.asset, error: job.error ?? '' })
    return failed.sort((a, b) => a.asset.localeCompare(b.asset))
  }

  async addScreeningReference(reference: ScreeningReference): Promise<'added' | 'known'> {
    const kept = ScreeningReference.parse(reference)
    const key = `${kept.imageHash.algorithm}:${kept.imageHash.bits}`
    if (this.references.has(key)) return 'known'
    this.references.set(key, structuredClone(kept))
    return 'added'
  }

  async screeningReferences(): Promise<ScreeningReference[]> {
    return [...this.references.values()].sort((a, b) => a.addedAt - b.addedAt || a.imageHash.bits.localeCompare(b.imageHash.bits)).map((r) => structuredClone(r))
  }

  async reap(olderThanMs: number, now: number): Promise<string[]> {
    const reaped: string[] = []
    for (const job of this.jobs.values()) {
      if (job.state === 'running' && job.startedAt !== undefined && now - job.startedAt > olderThanMs) {
        job.state = 'queued'
        delete job.startedAt
        reaped.push(job.hash)
      }
    }
    return reaped
  }
}

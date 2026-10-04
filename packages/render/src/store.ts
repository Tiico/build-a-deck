import type { CompiledLike, RenderKind } from './hash.js'
import { MemoryObjectStore, type ObjectStore } from './objects.js'

// The render queue (DRIFT §6): jobs keyed by content hash, textures before prints, oldest
// first, one worker at a time per job, and a reaper for jobs whose Chromium hung.
// Outputs are stored under the hash; a hash already rendered is a no-op forever. They live in
// an object store (DRIFT §4) — R2 on the box, memory in tests — under `renders/<hash>`.

export type Priority = 'texture' | 'print'
export type RenderRequest = { hash: string; kind: RenderKind; priority: Priority; compiled: CompiledLike; requestedAt: number }
export type JobState = 'queued' | 'running' | 'done' | 'failed'
export type JobStatus = { state: JobState; error?: string; startedAt?: number }
export type ClaimedJob = RenderRequest & { startedAt: number }
export type EnqueueResult = 'queued' | 'queued-already' | 'cached'
// What a texture's text was fitted to (#523): its smallest text in pt once E6 had fitted it, or
// null for a card with no words — and for every output made before this was kept.
export type Fit = { smallestPt: number | null }

export type RenderStore = {
  enqueue(req: RenderRequest): Promise<EnqueueResult>
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
}

const RANK: Record<Priority, number> = { texture: 0, print: 1 }

export const outputKey = (hash: string): string => `renders/${hash}`
export const contentTypeOf = (kind: RenderKind | undefined): string =>
  kind?.kind === 'pdf' || kind?.kind === 'booklet' ? 'application/pdf' : kind?.kind === 'png' ? 'image/png' : 'application/octet-stream'

export class MemoryRenderStore implements RenderStore {
  private readonly jobs = new Map<string, RenderRequest & JobStatus>()
  private readonly outputs = new Map<string, Fit>()

  constructor(private readonly objects: ObjectStore = new MemoryObjectStore()) {}

  async enqueue(req: RenderRequest): Promise<EnqueueResult> {
    if (this.outputs.has(req.hash)) return 'cached'
    const existing = this.jobs.get(req.hash)
    if (existing && (existing.state === 'queued' || existing.state === 'running')) return 'queued-already'
    this.jobs.set(req.hash, { ...req, state: 'queued' })
    return 'queued'
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

  async link(hash: string, ttlSeconds: number, disposition?: string): Promise<string | null> {
    return this.outputs.has(hash) ? this.objects.link(outputKey(hash), ttlSeconds, disposition) : null
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

import { classifierKey, Screening, type Classifier, type ScreeningResult } from '@byd/screening'
import type { Renderer } from './renderer.js'
import type { ClaimedJob, Fit, RenderStore } from './store.js'
import type { CompiledLike, RenderKind } from './hash.js'
import { AssetCache, inlineAssets, type AssetSource } from './assets.js'

export type WorkerOptions = {
  store: RenderStore
  renderer: Renderer
  // Where the pictures and typefaces a page names by hash are read from (#1028): Postgres or the
  // object store, as the app keeps them. Without it a page that names one fails.
  assets?: AssetSource
  // The classifiers a screening job may name (F4, #1271), by id and version. Without the one a
  // job names, the job fails and says which it asked for.
  classifiers?: readonly Classifier[]
  // 'empty': stop when the queue is empty (tests, one-shot). 'forever': keep polling.
  until: 'empty' | 'forever'
  pollMs?: number
  now?: () => number
  log?: (line: Record<string, unknown>) => void
}

// One job at a time, one page at a time (DRIFT §6): the worker is what the memory limit is
// sized for. A failure is recorded on the job and the loop goes on; Chromium hanging is the
// reaper's problem, not this loop's.
export async function runWorker(opts: WorkerOptions): Promise<string[]> {
  const now = opts.now ?? Date.now
  const done: string[] = []
  const cache = opts.assets ? new AssetCache(opts.assets) : undefined
  for (;;) {
    const job = await opts.store.claim(now())
    if (!job) {
      if (opts.until === 'empty') return done
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000))
      continue
    }
    try {
      if (job.kind.kind === 'screen') {
        const result = await screenJob(opts, job, cache, now)
        await opts.store.completeScreening(job.hash, result)
        done.push(job.hash)
        opts.log?.({ msg: 'screened', hash: job.hash, classifier: classifierKey(result.classifier) })
        continue
      }
      const page = await inlineAssets(job.compiled, cache)
      const { output, fit } = await renderJob(opts.renderer, job.kind, page)
      await opts.store.complete(job.hash, output, fit)
      done.push(job.hash)
      opts.log?.({ msg: 'rendered', hash: job.hash, kind: job.kind.kind, bytes: output.byteLength })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      await opts.store.fail(job.hash, error)
      opts.log?.({ msg: 'render-failed', hash: job.hash, error })
    }
  }
}

// What each kind of job is drawn as, all by the one renderer (E2). A texture keeps what its
// smallest text was fitted to (#523); a print has no reader to size for.
async function renderJob(renderer: Renderer, kind: RenderKind, page: CompiledLike): Promise<{ output: Uint8Array; fit?: Fit }> {
  switch (kind.kind) {
    case 'png': {
      const { png, smallestPt } = await renderer.renderTexture(page, { dpi: kind.dpi })
      return { output: png, fit: { smallestPt } }
    }
    case 'raster':
      return { output: await renderer.renderRaster(page, kind) }
    case 'pdf':
      return { output: await renderer.renderPdf(page) }
    case 'booklet':
      return { output: await renderer.renderBooklet(page) }
    case 'screen':
      throw new Error('a screening is not drawn as an output')
  }
}

// One picture screened (#1271): read as a card's pictures are, drawn at most `maxPx` across, and
// classified by the classifier and version the job names. A picture that is not there or cannot
// be decoded fails the job with its hash in the error, and leaves no result.
async function screenJob(opts: WorkerOptions, job: ClaimedJob, cache: AssetCache | undefined, now: () => number): Promise<ScreeningResult> {
  if (job.kind.kind !== 'screen') throw new Error(`job ${job.hash} is not a screening`)
  const { asset, classifier: wanted, maxPx } = job.kind
  const classifier = opts.classifiers?.find((c) => c.id === wanted.id && c.version === wanted.version)
  if (!classifier) throw new Error(`asset ${asset}: this worker has no classifier ${classifierKey(wanted)}`)
  const page = await inlineAssets(job.compiled, cache)
  let pixels
  try {
    pixels = await opts.renderer.renderPicture(page, { maxPx })
  } catch (err) {
    throw new Error(`asset ${asset}: ${err instanceof Error ? err.message : String(err)}`)
  }
  const { scores, imageHash } = Screening.parse(await classifier.classify(pixels))
  return { asset, classifier: wanted, scores, imageHash, screenedAt: now() }
}

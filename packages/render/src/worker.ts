import type { Renderer } from './renderer.js'
import type { Fit, RenderStore } from './store.js'
import type { CompiledLike, RenderKind } from './hash.js'
import { AssetCache, inlineAssets, type AssetSource } from './assets.js'

export type WorkerOptions = {
  store: RenderStore
  renderer: Renderer
  // Where the pictures and typefaces a page names by hash are read from (#1028): Postgres or the
  // object store, as the app keeps them. Without it a page that names one fails.
  assets?: AssetSource
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
  }
}

import type { Renderer } from './renderer.js'
import type { RenderStore } from './store.js'

export type WorkerOptions = {
  store: RenderStore
  renderer: Renderer
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
  for (;;) {
    const job = await opts.store.claim(now())
    if (!job) {
      if (opts.until === 'empty') return done
      await new Promise((r) => setTimeout(r, opts.pollMs ?? 1000))
      continue
    }
    try {
      // A texture keeps what its smallest text was fitted to (#523); a print has no reader to size for.
      const { output, fit } =
        job.kind.kind === 'png'
          ? await opts.renderer.renderTexture(job.compiled, { dpi: job.kind.dpi }).then(({ png, smallestPt }) => ({ output: png, fit: { smallestPt } }))
          : { output: job.kind.kind === 'booklet' ? await opts.renderer.renderBooklet(job.compiled) : await opts.renderer.renderPdf(job.compiled), fit: undefined }
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

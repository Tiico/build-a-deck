import { Renderer } from './renderer.js'
import { PostgresRenderStore } from './store-postgres.js'
import { runWorker } from './worker.js'

// The render worker container (DRIFT §6): one Chromium, one page at a time, a Postgres queue.
//   DATABASE_URL    — required
//   REAP_AFTER_MS   — a job running longer than this goes back to the queue; default 3 min

const url = process.env['DATABASE_URL']
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
const reapAfterMs = Number(process.env['REAP_AFTER_MS'] ?? 3 * 60 * 1000)
const log = (line: Record<string, unknown>) => console.log(JSON.stringify(line))

const store = PostgresRenderStore.connect(url)
await store.migrate()
const renderer = await Renderer.launch()
log({ msg: 'render-worker', state: 'ready' })

const reaper = setInterval(() => {
  void store.reap(reapAfterMs, Date.now()).then((hashes) => {
    if (hashes.length > 0) log({ msg: 'reaped', hashes })
  })
}, 30_000)

let stopping = false
const stop = async (signal: string) => {
  if (stopping) return
  stopping = true
  log({ msg: 'stopping', signal })
  clearInterval(reaper)
  await renderer.close()
  await store.close()
  process.exit(0)
}
process.on('SIGTERM', () => void stop('SIGTERM'))
process.on('SIGINT', () => void stop('SIGINT'))

await runWorker({ store, renderer, until: 'forever', log })

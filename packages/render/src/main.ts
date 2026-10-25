import { boxClassifiers } from '@byd/screening'
import { assetsFromEnv } from './objects.js'
import { Renderer } from './renderer.js'
import { PostgresRenderStore } from './store-postgres.js'
import { runWorker } from './worker.js'

// The render worker container (DRIFT §6): one Chromium, one page at a time, a Postgres queue.
//   DATABASE_URL    — required
//   REAP_AFTER_MS   — a job running longer than this goes back to the queue; default 3 min
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ASSETS_BUCKET — outputs go to R2
//                     (DRIFT §4), the same variables as the app; without them, to Postgres.
//                     The pictures and typefaces a page names are read from the same place.

const url = process.env['DATABASE_URL']
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}
const reapAfterMs = Number(process.env['REAP_AFTER_MS'] ?? 3 * 60 * 1000)
const log = (line: Record<string, unknown>) => console.log(JSON.stringify(line))

const objects = assetsFromEnv(process.env)
const store = PostgresRenderStore.connect(url, objects)
await store.migrate()
const renderer = await Renderer.launch()
log({ msg: 'render-worker', state: 'ready', outputs: objects ? 'r2' : 'postgres' })

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

// The pictures and typefaces a page names by hash are read from where the app put them (#1028),
// and a screening's picture is too (#1271); the classifiers run here, on the box (F4, beslut 8).
await runWorker({ store, renderer, assets: store.assets(), classifiers: boxClassifiers(), until: 'forever', log })

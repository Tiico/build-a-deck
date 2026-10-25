// The operator's door to screening (F4, #1271, DRIFT §12): run over Tailscale against the box's
// database, never through HTTP, and sent nowhere.
//   DATABASE_URL=… pnpm --filter @byd/server screening run <spel>
//   DATABASE_URL=… pnpm --filter @byd/server screening report <tröskel>
// `run` queues a screening of every picture the game's saved version names, in the classifier the
// box screens with now; the render worker does the rest, after textures and prints. `report` says
// how many pictures that classifier version has screened, how many failed, and which reach the
// threshold (a score from 0 to 1) in some category, highest first. One JSON line each.
import { PostgresRenderStore } from '@byd/render/queue'
import { CURRENT_CLASSIFIER } from '@byd/screening'
import { PostgresLogStore } from '../src/store-postgres.js'
import { queueScreening, screeningReport } from '../src/screening.js'

const [verb, arg] = process.argv.slice(2)
const url = process.env['DATABASE_URL']
const threshold = Number(arg)
if (!url || !arg || (verb !== 'run' && verb !== 'report') || (verb === 'report' && !(threshold >= 0 && threshold <= 1))) {
  console.error('usage: screening run <spel> | screening report <tröskel 0–1>   (DATABASE_URL)')
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
// The queue and the results are the render worker's, in the same database.
const renders = PostgresRenderStore.connect(url)
try {
  if (verb === 'run') {
    const queued = await queueScreening({ projects: store.projects(), assets: store.assets(), renders }, arg, CURRENT_CLASSIFIER)
    console.log(JSON.stringify({ msg: 'screening', verb, ...queued }))
    process.exitCode = queued.ok ? 0 : 1
  } else {
    const report = await screeningReport(renders, CURRENT_CLASSIFIER, threshold)
    console.log(JSON.stringify({ msg: 'screening', verb, ...report.summary }))
    for (const reached of report.reached) console.log(JSON.stringify({ msg: 'reached', ...reached }))
    for (const failed of report.failed) console.log(JSON.stringify({ msg: 'failed', ...failed }))
  }
} finally {
  await renders.close()
  await store.close()
}

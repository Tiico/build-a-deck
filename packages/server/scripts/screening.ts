// The operator's door to screening (F4, #1271, #1273, DRIFT §12): run over Tailscale against the
// box's database, never through HTTP, and sent nowhere.
//   DATABASE_URL=… pnpm --filter @byd/server screening run <spel>
//   DATABASE_URL=… pnpm --filter @byd/server screening run --alla
//   DATABASE_URL=… pnpm --filter @byd/server screening report <tröskel>
//   DATABASE_URL=… pnpm --filter @byd/server screening reference add <asset> <källa>
//   DATABASE_URL=… pnpm --filter @byd/server screening reference import <fil> <källa>
//   DATABASE_URL=… pnpm --filter @byd/server screening reference list
// `run` queues a screening of every picture the game's saved version names, or with `--alla` every
// picture on the box, in the classifier the box screens with now; the render worker does the rest,
// after textures and prints. A new upload is queued by itself (#1273), so `--alla` is for what came
// before, once. `report` says how many pictures that classifier version has screened, how many
// failed, the share that reach the threshold (a score from 0 to 1) per category and which they
// are, highest first, and which are near something on the reference list. `reference add` puts a
// picture on the box onto the list by its screening's PDQ hash — what is taken down — and
// `reference import` reads PDQ hashes from a file, one JSON object a line. One JSON line each.
import { readFile } from 'node:fs/promises'
import { PostgresRenderStore } from '@byd/render/queue'
import { CURRENT_CLASSIFIER } from '@byd/screening'
import { PostgresLogStore } from '../src/store-postgres.js'
import { addReferenceFromAsset, importReferences, queueAllScreenings, queueScreening, screeningReport } from '../src/screening.js'

const [verb = '', arg = '', extra = '', more = ''] = process.argv.slice(2)
const url = process.env['DATABASE_URL'] ?? ''
const threshold = Number(arg)
const known =
  (verb === 'run' && arg !== '') ||
  (verb === 'report' && arg !== '' && threshold >= 0 && threshold <= 1) ||
  (verb === 'reference' && ((arg === 'add' && extra !== '' && more !== '') || (arg === 'import' && extra !== '' && more !== '') || arg === 'list'))
if (!url || !known) {
  console.error('usage: screening run <spel>|--alla | screening report <tröskel 0–1> | screening reference add <asset> <källa> | reference import <fil> <källa> | reference list   (DATABASE_URL)')
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
// The queue, the results and the reference list are the render worker's, in the same database.
const renders = PostgresRenderStore.connect(url)
try {
  // The reference list is new with #1273; the worker makes it at its start, and so does this.
  await renders.migrate()
  if (verb === 'run' && arg === '--alla') {
    console.log(JSON.stringify({ msg: 'screening', verb, ...(await queueAllScreenings({ assets: store.assets(), renders }, CURRENT_CLASSIFIER)) }))
  } else if (verb === 'run') {
    const queued = await queueScreening({ projects: store.projects(), assets: store.assets(), renders }, arg, CURRENT_CLASSIFIER)
    console.log(JSON.stringify({ msg: 'screening', verb, ...queued }))
    process.exitCode = queued.ok ? 0 : 1
  } else if (verb === 'report') {
    const report = await screeningReport(renders, CURRENT_CLASSIFIER, threshold)
    console.log(JSON.stringify({ msg: 'screening', verb, ...report.summary }))
    for (const reached of report.reached) console.log(JSON.stringify({ msg: 'reached', ...reached }))
    for (const referenced of report.referenced) console.log(JSON.stringify({ msg: 'referenced', ...referenced }))
    for (const failed of report.failed) console.log(JSON.stringify({ msg: 'failed', ...failed }))
  } else if (arg === 'add') {
    const added = await addReferenceFromAsset(renders, CURRENT_CLASSIFIER, extra, more)
    console.log(JSON.stringify({ msg: 'reference', verb: 'add', asset: extra, ...added }))
    process.exitCode = added.ok ? 0 : 1
  } else if (arg === 'import') {
    const imported = await importReferences(renders, await readFile(extra, 'utf8'), more)
    console.log(JSON.stringify({ msg: 'reference', verb: 'import', file: extra, ...imported }))
    process.exitCode = imported.refused.length ? 1 : 0
  } else {
    for (const reference of await renders.screeningReferences()) console.log(JSON.stringify({ msg: 'reference', ...reference }))
  }
} finally {
  await renders.close()
  await store.close()
}

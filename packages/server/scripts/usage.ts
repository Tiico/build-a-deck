// What every account uses (#1193, #1192), for the price decision (ROADMAP fas 6): one line per
// account with its tier and, for every measure the server counts, the use and the ceiling (`null` is
// unlimited). Read from the box's database over Tailscale (DRIFT §10) and sent nowhere.
//   DATABASE_URL=… BYD_PLANS='…' pnpm --filter @byd/server usage
// `BYD_PLANS` is the box's own, so the ceilings are the ones the box holds; without it every ceiling
// reads as unlimited, which is what a box without it holds.
import { PostgresRenderStore } from '@byd/render/queue'
import { PostgresLogStore } from '../src/store-postgres.js'
import { usageReport } from '../src/account-plans.js'
import { plansFromEnv } from '../src/quotas.js'

const url = process.env['DATABASE_URL']
if (!url) {
  console.error('usage: DATABASE_URL=… [BYD_PLANS=…] usage')
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
// The render log is the queue's (#1197), in the same database.
const renders = PostgresRenderStore.connect(url)
try {
  for (const line of await usageReport({ auth: store.auth(), accountPlans: store.accountPlans(), projects: store.projects(), tables: store, renders }, plansFromEnv(process.env))) console.log(JSON.stringify(line))
} finally {
  await renders.close()
  await store.close()
}

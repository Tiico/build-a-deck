// The operator's side of a report (#1274, RUNBOOK §8): run over Tailscale against the box's database,
// never through HTTP, as `plan` and `erase` are (DRIFT §10, §12). It reads the box's own settings for
// what it sends: Resend for the mail (without a key the mail goes to the log), PUBLIC_ORIGIN for the
// links, BYD_CONTACT for the foot, and R2 for the bytes a purge takes out.
//   DATABASE_URL=… pnpm --filter @byd/server report list
//   DATABASE_URL=… pnpm --filter @byd/server report show A-0001
//   DATABASE_URL=… pnpm --filter @byd/server report pictures <spel>
//   DATABASE_URL=… pnpm --filter @byd/server report block <hash> <rights|illegal|terms> [--report A-0001]
//   DATABASE_URL=… pnpm --filter @byd/server report purge <hash>
//   DATABASE_URL=… pnpm --filter @byd/server report unblock <hash>
//   DATABASE_URL=… pnpm --filter @byd/server report decide A-0001 <held|rejected>
// The running app is told when a block commits, and every loaded table deals its deck again.
import { PostgresRenderStore, assetsFromEnv } from '@byd/render'
import { PostgresLogStore } from '../src/store-postgres.js'
import { mailerFromEnv } from '../src/auth.js'
import { REPORT_USAGE, runReport } from '../src/report-cli.js'

const url = process.env['DATABASE_URL']
if (!url) {
  console.error(REPORT_USAGE)
  process.exit(2)
}
const objects = assetsFromEnv(process.env)
const store = PostgresLogStore.connect(url)
const renders = PostgresRenderStore.connect(url, objects)
try {
  process.exitCode = await runReport(
    process.argv.slice(2),
    { reports: store.reports(), projects: store.projects(), auth: store.auth(), assets: store.assets(objects), renders, mailer: mailerFromEnv(process.env), origin: process.env['PUBLIC_ORIGIN'] ?? '', contact: process.env['BYD_CONTACT'] },
    { out: (line) => console.log(line), err: (line) => console.error(line) },
  )
} finally {
  await renders.close()
  await store.close()
}

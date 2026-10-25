// The operator's erasure (#1279, G6, F5): run over Tailscale against the box's database, never
// through HTTP, as `plan` is (DRIFT §10, §12).
//   DATABASE_URL=… pnpm --filter @byd/server erase table <session> [--seat <plats> | --name <namn>]
//   DATABASE_URL=… pnpm --filter @byd/server erase game <id>
//   DATABASE_URL=… pnpm --filter @byd/server erase ledger > raderingar.jsonl
//   DATABASE_URL=… pnpm --filter @byd/server erase replay [--from raderingar.jsonl]
// The running app is told when the erasure commits and reads a loaded table again, so no screen goes
// on showing a name the store no longer has. What it did is said in one line, counted; never a name.
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { PostgresLogStore } from '../src/store-postgres.js'
import { ERASE_USAGE, runErase } from '../src/erase-cli.js'

const url = process.env['DATABASE_URL']
if (!url) {
  console.error(ERASE_USAGE)
  process.exit(2)
}
const store = PostgresLogStore.connect(url)
try {
  // `--from -` reads the ledger from standard input, so a copy can be piped into a container.
  const read = (path: string) => (path === '-' ? Promise.resolve(readFileSync(0, 'utf8')) : readFile(path, 'utf8'))
  process.exitCode = await runErase(process.argv.slice(2), { store, erasures: store.erasures(), projects: store.projects() }, { out: (line) => console.log(line), err: (line) => console.error(line), read })
} finally {
  await store.close()
}

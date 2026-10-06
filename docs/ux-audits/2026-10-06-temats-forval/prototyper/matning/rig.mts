// Engångsrigg för prototypen till #687: e2e-stacken (det byggda appen på en origin, som lådan
// står) och en inloggningskaka. Guidad start behöver inget mer — `/new` är sidan som mäts.
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   ./node_modules/.bin/tsx rig.mts links.json
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store)
const origin = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto687@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
writeFileSync(OUT, JSON.stringify({ origin, cookie }, null, 2))
console.log('ready', OUT)
const stop = async () => {
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

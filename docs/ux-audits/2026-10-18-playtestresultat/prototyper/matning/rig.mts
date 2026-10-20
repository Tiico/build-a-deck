// Engångsrigg för prototypen till #1010: e2e-stacken (det byggda appen på ett origin, som på lådan),
// en render-worker mot stackens egen databas så att borden får sina kort ritade, och en inloggning
// att öppna editorn med. Spelet, borden, telefonerna, flaggorna och enkätsvaren görs av seed.mjs
// genom serverns egna vägar.
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   ../../../../../packages/e2e/node_modules/.bin/tsx rig.mts links.json
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { renderWorker } = await import(`${W}/packages/e2e/support/render.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store)
// Utan worker ritas inga texturer, och borden får aldrig sin länk eller sina miniatyrer (L5).
let worker: { stop: () => Promise<void> } | null = null
if (stack.database) {
  process.env['BYD_E2E_DATABASE_URL'] = stack.database
  worker = await renderWorker()
  console.log('render worker ready')
}
const origin = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto1010@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
writeFileSync(OUT, JSON.stringify({ origin, cookie, store: stack.store }, null, 2))
console.log('ready', OUT)
const stop = async () => {
  await worker?.stop()
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

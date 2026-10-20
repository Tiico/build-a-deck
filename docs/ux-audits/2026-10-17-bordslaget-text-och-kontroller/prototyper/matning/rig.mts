// Engångsrigg för prototypen till #682: e2e-stacken (det byggda appen på ett origin, som på lådan),
// en renderare mot samma databas så att korten får sina ansikten, och ett bord av provleken
// Sal's Saloon för fyra med Ada på A — samma bord som speltestet 2026-10-02 spelade i bordsläget.
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   ./node_modules/.bin/tsx rig.mts links.json
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { renderWorker } = await import(`${W}/packages/e2e/support/render.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store, stack.database)
if (!stack.database) throw new Error('ingen Postgres: renderaren behöver kön')
process.env['BYD_E2E_DATABASE_URL'] = stack.database
const worker = await renderWorker()
console.log('renderaren är uppe')
const origin: string = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto682@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }
const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(spelkortDoc(4)) })
if (p.status !== 201) throw new Error(`projekt: ${p.status} ${await p.text()}`)
const project = ((await p.json()) as { id: string }).id

// Ett nytt bord per fotografering: ett avvisat släpp och en blandning lämnar spår i loggen, och
// nästa variant ska börja på samma bord som den förra.
const tables: { id: string; code: string; hostKey: string; url: string }[] = []
for (let i = 0; i < Number(process.argv[3] ?? 40); i++) {
  const s = await fetch(`${origin}/projects/${encodeURIComponent(project)}/sessions`, { method: 'POST', headers: H })
  if (!s.ok) throw new Error(`bord: ${s.status} ${await s.text()}`)
  const t = (await s.json()) as { id: string; code: string; hostKey: string }
  const j = await fetch(`${origin}/rooms/${encodeURIComponent(t.code)}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', seat: 'A' }) })
  if (j.status !== 201) throw new Error(`Ada: ${j.status} ${await j.text()}`)
  tables.push({ ...t, url: `/table?session=${encodeURIComponent(t.id)}&host=${encodeURIComponent(t.hostKey)}&mode=table` })
}
writeFileSync(OUT, JSON.stringify({ origin, cookie, project, tables }, null, 2))
console.log('ready', OUT, tables.length)
const stop = async () => {
  await worker.stop()
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

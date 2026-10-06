// Engångsrigg för prototypen till #675: e2e-stacken (det byggda appen på ett origin, som på lådan)
// och ett Sal's Saloon-bord med fyra platser. Plats A heter Ada och har satt sig; B–D är lediga, så
// att väljaren på /join har något att välja. Fem kort i varje hand och tre i saloonen, så att TV:n
// och bordsläget ser ut som ett bord i vila och inte som en tom filt.
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   ../../../../../packages/e2e/node_modules/.bin/tsx rig.mts links.json
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { Host } = await import(`${W}/packages/e2e/support/host.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store)
const origin = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto675@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }

const doc = spelkortDoc(4)
const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(doc) })
const { id: project } = (await p.json()) as { id: string }
const s = await fetch(`${origin}/projects/${project}/sessions`, { method: 'POST', headers: H })
const { id: session, code, hostKey } = (await s.json()) as { id: string; code: string; hostKey: string }
const seats = doc.setup.seats as string[]
const j = await fetch(`${origin}/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', seat: 'A' }) })
const token = ((await j.json()) as { token: string }).token
const host = await Host.open(origin, { session, hostKey } as never)
await host.send([{ v: 'shuffle', pile: 'draw' }])
await host.send([{ v: 'deal', from: 'draw', to: seats.map((x) => `hand:${x}`), each: 5 }])
await host.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
host.close()
const hk = encodeURIComponent(hostKey)
const links = {
  origin, cookie, project, session, code,
  tvUrl: `/table?session=${session}&host=${hk}&mode=tv&lang=sv`,
  tableUrl: `/table?session=${session}&host=${hk}&mode=table&lang=sv`,
  // Ada's phone, so that seat A is taken when the picker is shot.
  playUrl: `/play?${new URLSearchParams({ session, code, seat: 'A', name: 'Ada', token }).toString()}`,
}
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => { await stack.stop(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

// Engångsrigg för prototypen till #683: e2e-stacken och två Sal's Saloon-bord (fyra och åtta
// platser) med kort i händerna, i saloonen, i kasthögen och framför varje plats. Variant D får två
// bord till, med högarna flyttade in mot mitten (±MM mm i stället för ±140).
//
//   cd matning && ../../../../../packages/e2e/node_modules/.bin/tsx rig.mts links.json 70
//
// (matning/node_modules ska vara en länk till packages/e2e/node_modules.)
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { Host } = await import(`${W}/packages/e2e/support/host.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)

const OUT = process.argv[2] ?? 'links.json'
const MM = Number(process.argv[3] ?? 70)
const stack = await start()
console.log('stack', stack.origin, stack.store)
const origin = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto683@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }

// Plats A har ett namn (Ada), de övriga är lediga — som vid speltestet, där skyltarna sa «ledig».
const tables: Record<string, unknown> = {}
for (const piles of [140, MM]) for (const players of [4, 8]) {
  const doc = spelkortDoc(players)
  if (piles !== 140)
    for (const z of doc.setup.zones) {
      if (z.id === 'draw') z.geometry = { ...z.geometry, x: -piles }
      if (z.id === 'discard') z.geometry = { ...z.geometry, x: piles }
    }
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
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 2, face: 'front' }])
  for (const seat of seats) await host.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  host.close()
  const hk = encodeURIComponent(hostKey)
  const q = (extra: Record<string, string>) => new URLSearchParams({ session, ...extra }).toString()
  tables[`p${players}${piles === 140 ? '' : 'd'}`] = {
    project, session, code,
    tvUrl: `/table?session=${session}&host=${hk}&mode=tv&lang=sv`,
    tableUrl: `/table?session=${session}&host=${hk}&mode=table&lang=sv`,
    onlineUrl: `/online?${q({ name: 'Ada', token, seat: 'A', lang: 'sv' })}`,
  }
}
writeFileSync(OUT, JSON.stringify({ origin, cookie, tables }, null, 2))
console.log('ready', OUT)
const stop = async () => { await stack.stop(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

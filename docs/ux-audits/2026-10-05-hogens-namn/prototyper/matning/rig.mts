// Engångsrigg för prototypen till #789: e2e-stacken (det byggda appen, Postgres, servern) och
// Sal's Saloon-bord med fyra och åtta platser. Utöver receptets två högar (Kortlek ±140 och
// Kasthög) får bordet två högar till, lagda där verktyget självt lägger en ny hög (`newPileSpot`),
// så att flera högar utan bild står på filten samtidigt — med ett långt, ett kort och ett
// mellanlångt namn överst.
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
const { newPileSpot } = await import(`${W}/packages/server/src/recipe.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store)
const origin = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto789@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }

// Överst på varje hög med framsidan upp: det längsta namnet i leken, det kortaste och ett mellan.
export const TOPS = { discard: 'Faster Than Your Own Shadow', p1: 'Duel', p2: 'Snake in the boot' }
const one = (title: string) => [{ field: 'title', is: [title] }]

const tables: Record<string, unknown> = {}
for (const players of [4, 8]) {
  const doc = spelkortDoc(players)
  for (const [id, name] of [['p1', 'Belöningar'], ['p2', 'Fynd']] as const) {
    const at = newPileSpot(doc.setup)
    if (!at) throw new Error(`ingen plats för ${id} vid ${players}`)
    doc.setup.zones.push({ id, kind: 'pile', name, visibility: 'all', geometry: at } as never)
    console.log(players, id, 'på', at.x, at.y)
  }
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(doc) })
  const { id: project } = (await p.json()) as { id: string }
  const s = await fetch(`${origin}/projects/${project}/sessions`, { method: 'POST', headers: H })
  const { id: session, code, hostKey } = (await s.json()) as { id: string; code: string; hostKey: string }
  const seats = doc.setup.seats as string[]
  const join = async (name: string, seat: string) => {
    const j = await fetch(`${origin}/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, seat }) })
    return ((await j.json()) as { token: string }).token
  }
  const ada = await join('Ada', 'A')
  const bo = await join('Bo', 'B')
  const host = await Host.open(origin, { session, hostKey } as never)
  // Namngivna kort först, ur den oblandade leken, så att högarnas toppar är de valda.
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1, face: 'front' }])
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1, face: 'front', which: one(TOPS.discard) }])
  await host.send([{ v: 'draw', from: 'draw', to: 'p1', count: 1, face: 'front', which: one(TOPS.p1) }])
  await host.send([{ v: 'draw', from: 'draw', to: 'p2', count: 1, face: 'front', which: one(TOPS.p2) }])
  await host.send([{ v: 'shuffle', pile: 'draw' }])
  await host.send([{ v: 'deal', from: 'draw', to: seats.map((x) => `hand:${x}`), each: 5 }])
  await host.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  for (const seat of seats) await host.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  host.close()
  const hk = encodeURIComponent(hostKey)
  const q = (extra: Record<string, string>) => new URLSearchParams({ session, ...extra }).toString()
  tables[`p${players}`] = {
    project, session, code,
    tableUrl: `/table?session=${session}&host=${hk}&mode=table&lang=sv`,
    onlineA: `/online?${q({ name: 'Ada', token: ada, seat: 'A', lang: 'sv' })}`,
    onlineB: `/online?${q({ name: 'Bo', token: bo, seat: 'B', lang: 'sv' })}`,
  }
}
writeFileSync(OUT, JSON.stringify({ origin, cookie, tops: TOPS, tables }, null, 2))
console.log('ready', OUT)
const stop = async () => { await stack.stop(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

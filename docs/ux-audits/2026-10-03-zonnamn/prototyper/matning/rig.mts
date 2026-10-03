// Throwaway rig for the #685 prototype: the e2e stack, a render worker, and two Sal's Saloon tables
// (four and eight seats) with cards in hands, in the saloon and in front of every seat.
import { writeFileSync } from 'node:fs'
const W = '/Users/nioc/Development/build-your-deck/.claude/worktrees/agent-ac154c1b3dea9344e'
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { renderWorker } = await import(`${W}/packages/e2e/support/render.ts`)
const { Host } = await import(`${W}/packages/e2e/support/host.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)

const OUT = process.argv[2]!
const stack = await start()
console.log('stack', stack.origin, stack.store)
if (stack.database) process.env['BYD_E2E_DATABASE_URL'] = stack.database
let worker: { stop: () => Promise<void> } | null = null
try {
  worker = await renderWorker()
  console.log('render worker up')
} catch (e) {
  console.log('no render worker', String(e).slice(0, 200))
}
const origin = stack.origin
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto685@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }

const NAMES = ['Ada', 'Bo', 'Cy', 'Di', 'Ed', 'Fi', 'Gun', 'Hal']
const tables: Record<string, unknown> = {}
for (const players of [4, 8]) {
  const doc = spelkortDoc(players)
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(doc) })
  const { id: project } = (await p.json()) as { id: string }
  const s = await fetch(`${origin}/projects/${project}/sessions`, { method: 'POST', headers: H })
  const { id: session, code, hostKey } = (await s.json()) as { id: string; code: string; hostKey: string }
  const seats = doc.setup.seats as string[]
  const tokens: Record<string, string> = {}
  for (const [i, seat] of seats.entries()) {
    const j = await fetch(`${origin}/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: NAMES[i], seat }) })
    tokens[seat] = ((await j.json()) as { token: string }).token
  }
  const o = await fetch(`${origin}/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Eva' }) })
  const observerToken = ((await o.json()) as { token: string }).token
  const host = await Host.open(origin, { session, hostKey } as never)
  await host.send([{ v: 'shuffle', pile: 'draw' }])
  await host.send([{ v: 'deal', from: 'draw', to: seats.map((s) => `hand:${s}`), each: 5 }])
  await host.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 2, face: 'front' }])
  for (const seat of seats) await host.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  host.close()
  const hk = encodeURIComponent(hostKey)
  const q = (extra: Record<string, string>) => new URLSearchParams({ session, ...extra }).toString()
  tables[`p${players}`] = {
    project,
    session,
    code,
    editorUrl: `/editor?project=${project}&lang=sv`,
    tvUrl: `/table?session=${session}&host=${hk}&mode=tv&lang=sv`,
    tableUrl: `/table?session=${session}&host=${hk}&mode=table&lang=sv`,
    onlineUrl: `/online?${q({ name: 'Ada', token: tokens['A']!, seat: 'A', lang: 'sv' })}`,
    observeUrl: `/observe?${q({ name: 'Eva', token: observerToken, lang: 'sv' })}`,
  }
}
writeFileSync(OUT, JSON.stringify({ origin, cookie, tables }, null, 2))
console.log('ready', OUT)
const stop = async () => {
  await worker?.stop()
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

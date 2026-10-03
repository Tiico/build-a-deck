// Variant D (geometry): the same tables with SEAT_GAP 40 mm instead of 10 between a seat's area and
// its counters, the 30 mm taken out of «Framför» so nothing outside the seat moves (K18, #89).
import { readFileSync, writeFileSync } from 'node:fs'
const W = '/Users/nioc/Development/build-your-deck/.claude/worktrees/agent-ac154c1b3dea9344e'
const { Host } = await import(`${W}/packages/e2e/support/host.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)
const FILE = new URL('links.json', import.meta.url)
const links = JSON.parse(readFileSync(FILE, 'utf8'))
const { origin, cookie } = links
const H = { 'content-type': 'application/json', cookie }
const GAP = Number(process.argv[2] ?? 40)
for (const players of [4, 8]) {
  const doc = spelkortDoc(players)
  for (const z of doc.setup.zones) {
    if (!z.id.startsWith('mine:')) continue
    const g = z.geometry
    const cut = GAP - 10
    if (g.w > g.h) z.geometry = { ...g, w: g.w - cut }
    else z.geometry = { ...g, h: g.h - cut }
  }
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify({ ...doc, name: `Sal's Saloon glipa ${GAP}` }) })
  const { id: project } = (await p.json()) as { id: string }
  const s = await fetch(`${origin}/projects/${project}/sessions`, { method: 'POST', headers: H })
  const { id: session, hostKey } = (await s.json()) as { id: string; code: string; hostKey: string }
  const seats = doc.setup.seats as string[]
  const host = await Host.open(origin, { session, hostKey } as never)
  await host.send([{ v: 'shuffle', pile: 'draw' }])
  await host.send([{ v: 'deal', from: 'draw', to: seats.map((x) => `hand:${x}`), each: 5 }])
  await host.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 2, face: 'front' }])
  for (const seat of seats) await host.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1, face: 'front' }])
  host.close()
  const hk = encodeURIComponent(hostKey)
  links.tables[`p${players}g`] = {
    project,
    session,
    editorUrl: `/editor?project=${project}&lang=sv`,
    tvUrl: `/table?session=${session}&host=${hk}&mode=tv&lang=sv`,
    tableUrl: `/table?session=${session}&host=${hk}&mode=table&lang=sv`,
    onlineUrl: `/online?session=${session}&seat=A&name=Ada&owner=1&lang=sv`,
    observeUrl: `/observe?session=${session}&name=Eva&owner=1&lang=sv`,
  }
}
writeFileSync(FILE, JSON.stringify(links, null, 2))
console.log('ok')
process.exit(0)

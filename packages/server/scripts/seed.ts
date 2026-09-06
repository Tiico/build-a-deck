// Creates a demo session on a running server and plays a few moves, so a table view has
// something to show. Usage: pnpm --filter @byd/server seed [http://localhost:8080] [sessionId]
import type { Intent } from '@byd/protocol'
import { applyPatch } from '@byd/engine'

const base = process.argv[2] ?? 'http://localhost:8080'
const id = process.argv[3] ?? 'demo'
const CARD = { id: 'card.standard.63x88', version: 1 }
const NAMES = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Vargar', 'Fälla', 'Eldstorm', 'Helande', 'Skugga', 'Gruva', 'Torn', 'Marknad', 'Skog', 'Hamn', 'Kung', 'Drottning', 'Narr', 'Spion', 'Lejon', 'Örn', 'Orm', 'Björn', 'Räv', 'Uggla']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })
const SEATS = ['N', 'E', 'S', 'W']
const setup = {
  seats: SEATS,
  floor: 'table',
  zones: [
    { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
    { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-140, 0) },
    { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(140, 0) },
    { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-330, -330, 660, 120) },
    { id: 'hand:N', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'N', returnTo: 'draw', geometry: rect(-250, -400, 500, 60) },
    { id: 'hand:E', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'E', returnTo: 'draw', geometry: rect(540, -250, 60, 500) },
    { id: 'hand:S', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'S', returnTo: 'draw', geometry: rect(-250, 340, 500, 60) },
    { id: 'hand:W', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'W', returnTo: 'draw', geometry: rect(-600, -250, 60, 500) },
  ],
  components: NAMES.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
}

// A deck so the table gets textures: one frame, a title and a line of body text per card.
const template = {
  faces: {
    front: {
      base: [
        { kind: 'shape', id: 'frame', x: 1, y: 1, w: 61, h: 86, shape: 'rect', fill: '#f4ead8', stroke: '#3a2a1a', strokeMm: 0.6, radiusMm: 3 },
        { kind: 'shape', id: 'art', x: 4, y: 4, w: 55, h: 36, shape: 'rect', fill: '#c9b8a0', radiusMm: 2 },
        { kind: 'text', id: 'title', x: 5, y: 42, w: 53, h: 9, bind: { field: 'title' }, font: { family: 'sans-serif', sizePt: 13, weight: 800 }, color: '#1c1c1c' },
        { kind: 'text', id: 'body', x: 5, y: 52, w: 53, h: 30, bind: { field: 'body' }, font: { family: 'sans-serif', sizePt: 8.5 }, color: '#333' },
        { kind: 'shape', id: 'costbg', x: 49, y: 4.5, w: 9, h: 9, shape: 'circle', fill: '#8b2e2e' },
        { kind: 'text', id: 'cost', x: 48, y: 5.5, w: 11, h: 8, bind: { field: 'cost' }, font: { family: 'sans-serif', sizePt: 14, weight: 800, align: 'center' }, color: '#fff', fit: 'fixed' },
      ],
      variants: {},
    },
    back: {
      base: [
        { kind: 'shape', id: 'bg', x: 0, y: 0, w: 63, h: 88, shape: 'rect', fill: '#2f4068' },
        { kind: 'shape', id: 'inner', x: 4, y: 4, w: 55, h: 80, shape: 'rect', fill: '#3a4d7a', stroke: '#1f2b4a', strokeMm: 0.8, radiusMm: 3 },
      ],
      variants: {},
    },
  },
}
const bodies = ['När detta kort spelas: dra ett kort.', 'Sköld 1. Kostar 1 mindre om du kontrollerar ett Torn.', 'Gör 2 skada på valfri varelse.', 'Hela 3 liv.']
const rows = Object.fromEntries(NAMES.map((n, i) => [n, { title: n, body: bodies[i % bodies.length], cost: String(1 + (i % 5)) }]))
const deck = { template, rows, icons: {} }

const res = await fetch(`${base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, version: 'v0.7', setup, deck }) })
if (res.status !== 201) {
  console.error('create failed', res.status, await res.text())
  process.exit(1)
}

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/sessions/${id}`)
await new Promise<void>((r) => ws.addEventListener('open', () => r()))
let n = 0
const send = (intents: Intent[]) =>
  new Promise<void>((resolve, reject) => {
    const envId = `seed${n++}`
    const onMsg = (ev: MessageEvent) => {
      const m = JSON.parse(String(ev.data))
      if (m.id !== envId) return
      ws.removeEventListener('message', onMsg)
      if (m.t === 'ack') resolve()
      else reject(new Error(`${m.t}: ${m.reason ?? m.message}`))
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ t: 'envelope', envelope: { id: envId, seat: null, intents } }))
  })

// The table view of the session right now, read from the same socket.
type Seen = { zones: { id: string; order?: string[] }[]; components: { id: string; zone: string }[] }
let latest: Seen | null = null
ws.addEventListener('message', (ev: MessageEvent) => {
  const m = JSON.parse(String(ev.data))
  if (m.t === 'snapshot') latest = m.snapshot
  if (m.t === 'patch' && latest) latest = applyPatch(latest as never, m.patch) as unknown as Seen
})
const snapshot = async (): Promise<Seen> => {
  await new Promise((r) => setTimeout(r, 30))
  if (!latest) throw new Error('no snapshot yet')
  return latest
}

const names: Record<string, string> = { N: 'Ada', E: 'Bo', S: 'Cy', W: 'Di' }
for (const s of SEATS) await send([{ v: 'seat.claim', seat: s, name: names[s] ?? s }])
await send([{ v: 'shuffle', pile: 'draw' }])
await send([{ v: 'deal', from: 'draw', to: SEATS.map((s) => `hand:${s}`), each: 3 }])
// A market row of four face-up cards, spread across the zone.
await send([{ v: 'draw', from: 'draw', to: 'market', count: 4 }])
const market = (await snapshot()).zones.find((z) => z.id === 'market') as { order: string[] }
await send(market.order.flatMap((id, i) => [
  { v: 'flip', component: id, face: 'front' } as Intent,
  { v: 'move', component: id, to: 'market', x: 40 + i * 160, y: 16 } as Intent,
]))
// Three face-up in the discard, three loose on the table: two face-up, one face-down.
await send([{ v: 'draw', from: 'draw', to: 'discard', count: 3 }])
const discard = (await snapshot()).zones.find((z) => z.id === 'discard') as { order: string[] }
await send(discard.order.map((id) => ({ v: 'flip', component: id, face: 'front' }) as Intent))
await send([{ v: 'draw', from: 'draw', to: 'table', count: 3 }])
const loose = (await snapshot()).components.filter((c) => c.zone === 'table').map((c) => c.id) as [string, string, string]
await send([
  { v: 'move', component: loose[0], to: 'table', x: -80, y: 170, rot: -6 },
  { v: 'flip', component: loose[0], face: 'front' },
  { v: 'move', component: loose[1], to: 'table', x: 30, y: 180, rot: 4 },
  { v: 'flip', component: loose[1], face: 'front' },
  { v: 'move', component: loose[2], to: 'table', x: 380, y: 40, rot: 88 },
])
ws.close()
console.log(`session ${id} ready`)
console.log(`  table:  http://localhost:5173/table?session=${id}&mode=table&code=KX7P&server=${encodeURIComponent(base.replace(/^http/, 'ws'))}`)
console.log(`  tv:     http://localhost:5173/table?session=${id}&mode=tv&code=KX7P&server=${encodeURIComponent(base.replace(/^http/, 'ws'))}`)

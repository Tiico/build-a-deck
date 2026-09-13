// Creates a demo session on a running server from the seed game and plays a few moves, so a
// table view has something to show. Usage: pnpm --filter @byd/server seed [http://localhost:8080] [sessionId]
import type { Intent } from '@byd/protocol'
import { applyPatch } from '@byd/engine'
import { deckFromProject, setupFromProject } from '../src/projects.js'
import { spelkortDoc } from './spelkort.js'

const base = process.argv[2] ?? 'http://localhost:8080'
const id = process.argv[3] ?? 'demo'
// The seed game as a project document at a four-seat table; the session gets the setup and the
// deck a table started from that project would (L4).
const doc = spelkortDoc()
const setup = setupFromProject(doc)
const deck = deckFromProject(doc)
const SEATS = doc.setup.seats

const res = await fetch(`${base}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, version: 'v0.7', setup, deck }) })
if (res.status !== 201) {
  console.error('create failed', res.status, await res.text())
  process.exit(1)
}
// The key the table is opened with (DRIFT §9). A seatless connection without it is refused, so
// the script has to carry the one it was just handed.
const { hostKey, code } = (await res.json()) as { hostKey: string; code: string }

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/sessions/${id}?host=${encodeURIComponent(hostKey)}`)
await new Promise<void>((r) => ws.addEventListener('open', () => r()))
// A refusal carries no envelope id, so waiting for an ack that matches would wait for ever. Say
// what happened instead of hanging.
ws.addEventListener('message', (ev: MessageEvent) => {
  const m = JSON.parse(String(ev.data))
  if (m.t === 'refused') {
    console.error('refused:', m.reason)
    process.exit(1)
  }
})
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

const names = ['Ada', 'Bo', 'Cy', 'Di', 'Eva', 'Finn', 'Gro', 'Hal']
for (const [i, s] of SEATS.entries()) await send([{ v: 'seat.claim', seat: s, name: names[i] ?? s }])
await send([{ v: 'shuffle', pile: 'draw' }])
await send([{ v: 'deal', from: 'draw', to: SEATS.map((s) => `hand:${s}`), each: 3 }])
// The saloon's shop row: four face-up cards, spread across the zone.
await send([{ v: 'draw', from: 'draw', to: 'market', count: 4 }])
const market = (await snapshot()).zones.find((z) => z.id === 'market') as { order: string[] }
await send(market.order.flatMap((id, i) => [
  { v: 'flip', component: id, face: 'front' } as Intent,
  { v: 'move', component: id, to: 'market', x: 20 + i * 125, y: 16 } as Intent,
]))
// Three face-up in the discard, three loose on the table: two face-up, one face-down.
await send([{ v: 'draw', from: 'draw', to: 'discard', count: 3 }])
const discard = (await snapshot()).zones.find((z) => z.id === 'discard') as { order: string[] }
await send(discard.order.map((id) => ({ v: 'flip', component: id, face: 'front' }) as Intent))
await send([{ v: 'draw', from: 'draw', to: 'table', count: 3 }])
const loose = (await snapshot()).components.filter((c) => c.zone === 'table').map((c) => c.id) as [string, string, string]
// Coordinates are relative to the zone, so a loose card on the floor runs 0…1200 by 0…800 —
// negative ones would lay the demo's cards off the felt entirely.
await send([
  { v: 'move', component: loose[0], to: 'table', x: 520, y: 570, rot: -6 },
  { v: 'flip', component: loose[0], face: 'front' },
  { v: 'move', component: loose[1], to: 'table', x: 630, y: 580, rot: 4 },
  { v: 'flip', component: loose[1], face: 'front' },
  { v: 'move', component: loose[2], to: 'table', x: 980, y: 440, rot: 88 },
])
ws.close()
// The links only work if they carry what opens a table (DRIFT §9), and the room code is the one
// the server just made rather than a constant. WEB_ORIGIN moves them to whichever port the web
// app is on.
const web = process.env['WEB_ORIGIN'] ?? 'http://localhost:5173'
const server = encodeURIComponent(base.replace(/^http/, 'ws'))
const host = encodeURIComponent(hostKey)
console.log(`session ${id} ready`)
console.log(`  code:     ${code}`)
console.log(`  host key: ${hostKey}`)
console.log(`  table:    ${web}/table?session=${id}&mode=table&host=${host}&code=${code}&server=${server}`)
console.log(`  tv:       ${web}/table?session=${id}&mode=tv&host=${host}&code=${code}&server=${server}`)
console.log(`  join:     ${web}/join?code=${code}&server=${server}`)

// PROTOTYPE — throwaway. A plausible mid-game table, produced by the real engine in the
// browser and projected for the `table` role. No server, no persistence.
import {
  CARD_STANDARD_63x88,
  TypeRegistry,
  apply,
  counterIds,
  decide,
  initialState,
  project,
  replay,
  seededRng,
  type SetupDef,
  type TableState,
} from '@byd/engine'
import type { Applied, Intent, Snapshot } from '@byd/protocol'

const registry = new TypeRegistry([CARD_STANDARD_63x88])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const NAMES = [
  'Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte',
  'Vargar', 'Fälla', 'Eldstorm', 'Helande', 'Skugga', 'Gruva', 'Torn', 'Marknad', 'Skog', 'Hamn',
  'Kung', 'Drottning', 'Narr', 'Spion', 'Lejon', 'Örn', 'Orm', 'Björn', 'Räv', 'Uggla',
]

export const SEATS = ['N', 'E', 'S', 'W'] as const
export const SEAT_NAMES: Record<string, string> = { N: 'Ada', E: 'Bo', S: 'Cy', W: 'Di' }
export const SEAT_COLORS: Record<string, string> = { N: '#e05a4f', E: '#3c8ce7', S: '#3aa76d', W: '#d99a1f' }

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number, rot = 0) => ({ x, y, w: 0, h: 0, rot })

// Table coordinates are millimetres; the table is 1200 × 800 with the origin in the middle.
export const TABLE = { w: 1200, h: 800 }

function setup(): SetupDef {
  return {
    seats: [...SEATS],
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
}

export type Scene = { state: TableState; snapshot: Snapshot; log: Applied[] }

export function buildScene(): Scene {
  let state = initialState('v0.7', setup(), registry)
  const log: Applied[] = []
  const initial = initialState('v0.7', setup(), registry)
  const deps = {
    rng: seededRng(7),
    ids: counterIds('r'),
    now: () => new Date().toISOString(),
    history: { stateAt: (seq: number) => replay(initial, registry, log.filter((l) => l.seq <= seq)), lines: () => log },
  }
  let n = 0
  const run = (seat: string | null, ...intents: Intent[]) => {
    const d = decide(state, registry, { id: `p${n++}`, seat, intents }, deps)
    if (!d.ok) throw new Error(d.reason)
    for (const line of d.applied) {
      state = apply(state, registry, line)
      log.push(line)
    }
  }
  const top = (zone: string) => state.zones[zone]!.order[0]!
  const nth = (zone: string, i: number) => state.zones[zone]!.order[i]!

  for (const s of SEATS) run(null, { v: 'seat.claim', seat: s, name: SEAT_NAMES[s]! })
  run(null, { v: 'shuffle', pile: 'draw' })
  run(null, { v: 'deal', from: 'draw', to: SEATS.map((s) => `hand:${s}`), each: 5 })
  run(null, { v: 'draw', from: 'draw', to: 'market', count: 4 })
  for (let i = 0; i < 4; i++) {
    const id = nth('market', i)
    run(null, { v: 'flip', component: id, face: 'front' })
    run(null, { v: 'move', component: id, to: 'market', x: 40 + i * 160, y: 16 })
  }
  run('S', { v: 'move', component: top('hand:S'), to: 'table', x: -80, y: 170, rot: -6 })
  run('S', { v: 'flip', component: top('table'), face: 'front' })
  run('S', { v: 'move', component: top('hand:S'), to: 'table', x: 30, y: 180, rot: 4 })
  run('S', { v: 'flip', component: top('table'), face: 'front' })
  run('E', { v: 'move', component: top('hand:E'), to: 'table', x: 380, y: 40, rot: 88 })
  run('N', { v: 'move', component: top('hand:N'), to: 'table', x: -420, y: -140, rot: 12 })
  run('N', { v: 'move', component: top('hand:N'), to: 'table', x: -430, y: -120, rot: 9 })
  run('N', { v: 'stack', component: nth('table', 0), onto: nth('table', 1) })
  run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
  for (const id of [...state.zones['discard']!.order]) run(null, { v: 'flip', component: id, face: 'front' })
  run('W', { v: 'draw', from: 'draw', to: 'hand:W', count: 1 })

  return { state, snapshot: project(state, registry, null), log }
}

// A stable colour per card so the prototype has some visual variety without art.
export function hue(cardRef: string): number {
  let h = 0
  for (const ch of cardRef) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// Fake presence for the prototype: two cursors wandering the table.
export const CURSORS = [
  { seat: 'S', x: -60, y: 120 },
  { seat: 'E', x: 300, y: -60 },
]

// The log as one line of Swedish per entry, for activity feeds.
export function describe(line: Applied): string {
  const who = line.by ? SEAT_NAMES[line.by] ?? line.by : 'Bordet'
  const it = line.intent
  switch (it.v) {
    case 'shuffle': return `${who} blandade ${it.pile}`
    case 'deal': return `${who} delade ut ${it.each} var`
    case 'draw': return `${who} drog ${it.count} från ${it.from}`
    case 'move': return `${who} flyttade ett kort till ${it.to}`
    case 'flip': return `${who} vände ett kort`
    case 'stack': return `${who} lade ett kort på ett annat`
    case 'seat.claim': return `${it.name} satte sig på plats ${it.seat}`
    default: return `${who}: ${it.v}`
  }
}

// PROTOTYPE — the real engine in the browser on a big table with content clustered in the
// middle, so a camera has something to frame. Bo and Cy play now and then, sometimes far away.
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
  type DecideDeps,
  type SetupDef,
  type TableState,
} from '@byd/engine'
import type { Activity, Applied, Intent, Snapshot } from '@byd/protocol'

export const registry = new TypeRegistry([CARD_STANDARD_63x88])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const CARDS = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Alv', 'Dvärg', 'Orm', 'Varg', 'Örn', 'Björn', 'Räv', 'Lo', 'Uggla', 'Korp', 'Hjort', 'Vildsvin', 'Mård', 'Utter', 'Grävling', 'Igelkott', 'Hare', 'Ekorre']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// A 1400 × 900 mm table: a real dining table, of which a round of cards uses a fraction.
export const setup: SetupDef = {
  seats: ['A', 'B', 'C'],
  floor: 'table',
  zones: [
    { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-330, -120) },
    { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(-200, -120) },
    { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-90, -200, 520, 130) },
    { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-700, -450, 1400, 900) },
    { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 330, 600, 100) },
    { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -430, 600, 100) },
    { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: rect(590, -200, 100, 400) },
  ],
  components: CARDS.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
}

export class Table {
  readonly initial = initialState('v1', setup, registry)
  state: TableState = this.initial
  readonly log: Applied[] = []
  lastReason: string | null = null
  private n = 0
  private readonly deps: DecideDeps = {
    rng: seededRng(5),
    ids: counterIds('r'),
    now: () => new Date().toISOString(),
    history: { stateAt: (seq) => replay(this.initial, registry, this.log.filter((l) => l.seq <= seq)), lines: () => this.log },
  }

  // Returns the lines applied, or none when rejected.
  act(seat: string | null, ...intents: Intent[]): Applied[] {
    const d = decide(this.state, registry, { id: `e${this.n++}`, seat, intents }, this.deps)
    if (!d.ok) {
      this.lastReason = d.reason
      return []
    }
    this.lastReason = null
    for (const line of d.applied) {
      this.state = apply(this.state, registry, line)
      this.log.push(line)
    }
    return d.applied
  }
  view(seat: string | null): Snapshot {
    return project(this.state, registry, seat, undefined, this.deps.history)
  }
  activity(): Activity[] {
    return this.log.map(({ seq, batch, at, by, intent }) => ({ seq, batch, at, by, intent }))
  }
  loose(): string[] {
    return [...this.state.zones['table']!.order]
  }
  hand(seat: string): string[] {
    return [...this.state.zones[`hand:${seat}`]!.order]
  }
}

export function scripted(): Table {
  const t = new Table()
  t.act(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  t.act(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  t.act(null, { v: 'seat.claim', seat: 'C', name: 'Cy' })
  t.act(null, { v: 'shuffle', pile: 'draw' })
  t.act(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B', 'hand:C'], each: 4 })
  t.act(null, { v: 'draw', from: 'draw', to: 'market', count: 3 })
  const market = [...t.state.zones['market']!.order]
  market.forEach((id, i) => t.act(null, { v: 'move', component: id, to: 'market', x: 20 + i * 150, y: 20 }, { v: 'flip', component: id, face: 'front' }))
  t.act(null, { v: 'draw', from: 'draw', to: 'table', count: 3 })
  const loose = t.loose()
  // Floor coordinates: (700, 450) is the centre of the table.
  t.act(null, { v: 'move', component: loose[0]!, to: 'table', x: 560, y: 470 }, { v: 'flip', component: loose[0]!, face: 'front' })
  t.act(null, { v: 'move', component: loose[1]!, to: 'table', x: 700, y: 500, rot: 15 }, { v: 'flip', component: loose[1]!, face: 'front' })
  t.act(null, { v: 'move', component: loose[2]!, to: 'table', x: 830, y: 460 })
  t.act(null, { v: 'draw', from: 'draw', to: 'discard', count: 2 })
  for (const id of [...t.state.zones['discard']!.order]) t.act(null, { v: 'flip', component: id, face: 'front' })
  return t
}

// Someone else's move, so the table is alive: mostly near the middle, now and then far out
// at the edge of the table — the case a camera has to handle.
export function someoneElsePlays(t: Table, far: boolean): Applied[] {
  const seat = Math.random() < 0.5 ? 'B' : 'C'
  const roll = Math.random()
  const hand = t.hand(seat)
  const card = hand[0]
  if (roll < 0.45 && card) {
    const x = far ? (Math.random() < 0.5 ? 40 + Math.random() * 120 : 1200 + Math.random() * 130) : 450 + Math.random() * 500
    const y = far ? 80 + Math.random() * 700 : 300 + Math.random() * 300
    return t.act(seat, { v: 'move', component: card, to: 'table', x, y, rot: Math.round(Math.random() * 30 - 15) }, { v: 'flip', component: card, face: 'front' })
  }
  const loose = t.loose()
  if (roll < 0.75 && loose.length > 2) {
    const pick = loose[Math.floor(Math.random() * loose.length)]!
    return t.act(seat, { v: 'move', component: pick, to: 'discard' })
  }
  return t.act(seat, { v: 'draw', from: 'draw', to: `hand:${seat}`, count: 1 })
}

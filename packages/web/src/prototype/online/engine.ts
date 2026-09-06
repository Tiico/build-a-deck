// PROTOTYPE — the real engine in the browser with a table mid-game: loose cards, piles, hands.
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
const CARDS = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Alv', 'Dvärg', 'Orm', 'Varg', 'Örn', 'Björn', 'Räv', 'Lo', 'Uggla', 'Korp', 'Hjort', 'Vildsvin', 'Mård', 'Utter']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

const setup: SetupDef = {
  seats: ['A', 'B', 'C'],
  floor: 'table',
  zones: [
    { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-420, -60) },
    { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(-250, -60) },
    { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-60, -200, 520, 130) },
    { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
    { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
    { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
    { id: 'hand:C', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'C', returnTo: 'draw', geometry: rect(395, -200, 100, 400) },
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
    rng: seededRng(3),
    ids: counterIds('r'),
    now: () => new Date().toISOString(),
    history: { stateAt: (seq) => replay(this.initial, registry, this.log.filter((l) => l.seq <= seq)), lines: () => this.log },
  }

  act(seat: string | null, ...intents: Intent[]): boolean {
    const d = decide(this.state, registry, { id: `e${this.n++}`, seat, intents }, this.deps)
    if (!d.ok) {
      this.lastReason = d.reason
      return false
    }
    this.lastReason = null
    for (const line of d.applied) {
      this.state = apply(this.state, registry, line)
      this.log.push(line)
    }
    return true
  }
  view(seat: string | null): Snapshot {
    return project(this.state, registry, seat, undefined, this.deps.history)
  }
  // The seat's view with its own hand folded to a count: the hand is drawn elsewhere.
  viewWithoutHand(seat: string): Snapshot {
    const v = this.view(seat)
    const hand = `hand:${seat}`
    return {
      ...v,
      zones: v.zones.map((z) => (z.id === hand && z.mode === 'order' ? { mode: 'count', id: z.id, kind: z.kind, name: z.name, geometry: z.geometry, dynamic: z.dynamic, ...(z.owner !== undefined ? { owner: z.owner } : {}), count: z.order.length } : z)),
      components: v.components.filter((c) => c.zone !== hand),
    }
  }
  activity(): Activity[] {
    return this.log.map(({ seq, batch, at, by, intent }) => ({ seq, batch, at, by, intent }))
  }
}

export function scripted(): Table {
  const t = new Table()
  t.act(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  t.act(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  t.act(null, { v: 'seat.claim', seat: 'C', name: 'Cy' })
  t.act(null, { v: 'shuffle', pile: 'draw' })
  t.act(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 })
  t.act(null, { v: 'draw', from: 'draw', to: 'market', count: 3 })
  const market = [...t.state.zones['market']!.order]
  market.forEach((id, i) => t.act(null, { v: 'move', component: id, to: 'market', x: 20 + i * 150, y: 20 }, { v: 'flip', component: id, face: 'front' }))
  t.act(null, { v: 'draw', from: 'draw', to: 'table', count: 3 })
  const loose = [...t.state.zones['table']!.order]
  t.act(null, { v: 'move', component: loose[0]!, to: 'table', x: 120, y: 330 }, { v: 'flip', component: loose[0]!, face: 'front' })
  t.act(null, { v: 'move', component: loose[1]!, to: 'table', x: 330, y: 360, rot: 15 }, { v: 'flip', component: loose[1]!, face: 'front' })
  t.act(null, { v: 'move', component: loose[2]!, to: 'table', x: 600, y: 300 })
  t.act(null, { v: 'draw', from: 'draw', to: 'discard', count: 2 })
  for (const id of [...t.state.zones['discard']!.order]) t.act(null, { v: 'flip', component: id, face: 'front' })
  return t
}

// PROTOTYPE — the real engine in the browser, with a scripted table and two named players.
import {
  CARD_STANDARD_63x88,
  TypeRegistry,
  apply,
  counterIds,
  decide,
  effectiveLines,
  initialState,
  project,
  replay,
  seededRng,
  undoTarget,
  type DecideDeps,
  type SetupDef,
  type TableState,
} from '@byd/engine'
import type { Activity, Applied, Intent, Snapshot } from '@byd/protocol'

export const registry = new TypeRegistry([CARD_STANDARD_63x88])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const CARDS = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Alv', 'Dvärg']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

const setup: SetupDef = {
  seats: ['A', 'B'],
  floor: 'table',
  zones: [
    { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0) },
    { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(200, 0) },
    { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
    { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
    { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
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
    rng: seededRng(7),
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
    return project(this.state, registry, seat)
  }
  viewAt(seq: number, seat: string | null): Snapshot {
    return project(this.deps.history.stateAt(seq), registry, seat)
  }
  // The feed: everything said and done that is still in effect, proposals included.
  activity(): Activity[] {
    const inEffect = new Set(effectiveLines(this.log).map((l) => l.seq))
    return this.log
      .filter((l) => inEffect.has(l.seq) || l.intent.v.startsWith('rewind.'))
      .map(({ seq, batch, at, by, intent }) => ({ seq, batch, at, by, intent }))
  }
  // Where undo.self would land for a seat, or why it cannot.
  undo(seat: string): number | 'contested' | null {
    return undoTarget(this.log, seat)
  }
  // The lines a rewind to `toSeq` would take back.
  undone(toSeq: number): Activity[] {
    return this.activity().filter((l) => l.seq > toSeq && !l.intent.v.startsWith('rewind.'))
  }
  name(seat: string | null): string {
    return seat === null ? 'Bordet' : this.state.seats[seat]?.name ?? seat
  }
}

export function scripted(): Table {
  const t = new Table()
  t.act(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  t.act(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  t.act(null, { v: 'shuffle', pile: 'draw' })
  t.act(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 3 })
  const a = t.state.zones['hand:A']!.order[0]!
  t.act('A', { v: 'move', component: a, to: 'table', x: 120, y: 60 }, { v: 'flip', component: a, face: 'front' })
  t.act('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
  const b = t.state.zones['hand:B']!.order[0]!
  t.act('B', { v: 'move', component: b, to: 'table', x: 420, y: 200 }, { v: 'flip', component: b, face: 'front' })
  t.act('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
  return t
}

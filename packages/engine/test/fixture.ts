import type { Applied, Intent, SeatId, Snapshot } from '@byd/protocol'
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
  type History,
  type Sources,
  type Decision,
  type SetupDef,
  type TableState,
} from '../src/index.js'

export const registry = new TypeRegistry([CARD_STANDARD_63x88])
export const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
export const CARDS = ['dragon', 'knight', 'wizard', 'rogue', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre']
export const SEATS: (SeatId | null)[] = ['A', 'B', null]

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

export function twoSeatSetup(): SetupDef {
  return {
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
}

export function sources(seed = 1): Sources {
  return { rng: seededRng(seed), ids: counterIds('r'), now: () => '2026-09-05T00:00:00.000Z' }
}

// A live session: decides, applies, and keeps the log — exactly what the server will do.
export class Harness {
  state: TableState
  readonly initial: TableState
  readonly log: Applied[] = []
  readonly deps: DecideDeps
  private envelopes = 0

  constructor(seed = 1, setup: SetupDef = twoSeatSetup()) {
    this.initial = initialState('v1', setup, registry)
    this.state = this.initial
    const history: History = {
      stateAt: (seq) => replay(this.initial, registry, this.log.filter((l) => l.seq <= seq)),
      lines: () => this.log,
    }
    this.deps = { ...sources(seed), history }
  }

  try(seat: SeatId | null, ...intents: Intent[]): Decision {
    return decide(this.state, registry, { id: `e${this.envelopes++}`, seat, intents }, this.deps)
  }

  // Sends one envelope; returns its applied lines.
  batch(seat: SeatId | null, ...intents: Intent[]): Applied[] {
    const d = this.try(seat, ...intents)
    if (!d.ok) throw new Error(`rejected ${intents.map((i) => i.v).join('+')}: ${d.reason}`)
    for (const line of d.applied) {
      this.state = apply(this.state, registry, line)
      this.log.push(line)
    }
    return d.applied
  }

  // Sends a single-intent envelope; returns its one applied line.
  do(seat: SeatId | null, intent: Intent): Applied {
    const [line] = this.batch(seat, intent)
    if (!line) throw new Error('unreachable: one intent yields one line')
    return line
  }

  view(seat: SeatId | null): Snapshot {
    return project(this.state, registry, seat, undefined, this.deps.history)
  }

  zone(id: string): string[] {
    return this.state.zones[id]!.order
  }

  top(zoneId: string): string {
    return this.zone(zoneId)[0]!
  }

  // Ids of the dynamic piles currently on the table.
  piles(): string[] {
    return Object.values(this.state.zones)
      .filter((z) => z.dynamic)
      .map((z) => z.id)
      .sort()
  }
}

export function inZone(view: Snapshot, zone: string) {
  return view.components.filter((c) => c.zone === zone)
}

export function zoneView(view: Snapshot, zone: string) {
  return view.zones.find((z) => z.id === zone)!
}

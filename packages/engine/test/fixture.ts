import type { Applied, Intent, SeatId, Snapshot } from '@byd/protocol'
import {
  CARD_STANDARD_63x88,
  TypeRegistry,
  apply,
  counterIds,
  decide,
  initialState,
  project,
  seededRng,
  type DecideDeps,
  type Decision,
  type SetupDef,
  type TableState,
} from '../src/index.js'

export const registry = new TypeRegistry([CARD_STANDARD_63x88])
export const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
export const CARDS = ['dragon', 'knight', 'wizard', 'rogue', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre']
export const SEATS: (SeatId | null)[] = ['A', 'B', null]

export function twoSeatSetup(): SetupDef {
  return {
    seats: ['A', 'B'],
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none' },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all' },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all' },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw' },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw' },
    ],
    components: CARDS.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
  }
}

export function deps(seed = 1): DecideDeps {
  return { rng: seededRng(seed), ids: counterIds('r'), now: () => '2026-09-05T00:00:00.000Z' }
}

// A live session: decides, applies, and keeps the log — exactly what the server will do.
export class Harness {
  state: TableState
  readonly initial: TableState
  readonly log: Applied[] = []
  readonly deps: DecideDeps

  constructor(seed = 1, setup: SetupDef = twoSeatSetup()) {
    this.initial = initialState('v1', setup, registry)
    this.state = this.initial
    this.deps = deps(seed)
  }

  try(seat: SeatId | null, intent: Intent): Decision {
    return decide(this.state, registry, { id: `e${this.log.length}`, seat, intent }, this.deps)
  }

  do(seat: SeatId | null, intent: Intent): Applied {
    const d = this.try(seat, intent)
    if (!d.ok) throw new Error(`rejected ${intent.v}: ${d.reason}`)
    this.state = apply(this.state, registry, d.applied)
    this.log.push(d.applied)
    return d.applied
  }

  view(seat: SeatId | null): Snapshot {
    return project(this.state, registry, seat)
  }

  zone(id: string): string[] {
    return this.state.zones[id]!.order
  }

  top(zoneId: string): string {
    return this.zone(zoneId)[0]!
  }
}

export function inZone(view: Snapshot, zone: string) {
  return view.components.filter((c) => c.zone === zone)
}

export function zoneView(view: Snapshot, zone: string) {
  return view.zones.find((z) => z.id === zone)!
}

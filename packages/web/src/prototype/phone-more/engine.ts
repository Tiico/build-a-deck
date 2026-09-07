// PROTOTYPE — the real engine in the browser with a seat that owns more than a hand (C4): a
// private area in front of it, and counters. A counter is a component type of its own (B2):
// one face, a value, no shuffling — the registry takes it as data.
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
  type ComponentTypeDef,
  type DecideDeps,
  type SetupDef,
  type TableState,
} from '@byd/engine'
import type { Applied, Intent, Snapshot } from '@byd/protocol'

export const COUNTER_TOKEN: ComponentTypeDef = {
  id: 'token.counter',
  version: 1,
  physical: { shape: 'circle', widthMm: 20, heightMm: 20, thicknessMm: 2, material: 'acrylic' },
  faces: ['front'],
  contentFace: 'front',
  behaviours: { stackable: false, shufflable: false, flippable: false, rollable: false, counter: true },
  editorSchema: [{ key: 'title', label: 'Title', kind: 'text', required: true }],
  print: { bleedMm: 0, safeMm: 1, dpi: 300, colorProfile: 'sRGB', minPtByScript: { Latn: 6 } },
  manufacturableBy: [],
}
export const registry = new TypeRegistry([CARD_STANDARD_63x88, COUNTER_TOKEN])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const TOKEN = { id: COUNTER_TOKEN.id, version: 1 }
const CARDS = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Alv', 'Dvärg', 'Orm', 'Varg', 'Örn', 'Björn']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// Two seats; each owns a hand, an area in front of it ("Framför dig"), and a counters zone.
export const setup: SetupDef = {
  seats: ['A', 'B'],
  floor: 'table',
  zones: [
    { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0), shortcut: { label: 'Lägg underst', at: 'bottom' } },
    { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(200, 0), shortcut: { label: 'Kasta', at: 'top' } },
    { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
    { id: 'mine:A', kind: 'area', name: 'Framför Ada', visibility: 'owner', owner: 'A', geometry: rect(-300, 200, 600, 110), shortcut: { label: 'Framför mig', at: 'top' } },
    { id: 'mine:B', kind: 'area', name: 'Framför Bo', visibility: 'owner', owner: 'B', geometry: rect(-300, -310, 600, 110), shortcut: { label: 'Framför mig', at: 'top' } },
    { id: 'counters:A', kind: 'area', name: 'Räknare', visibility: 'all', owner: 'A', geometry: rect(320, 200, 160, 110) },
    { id: 'counters:B', kind: 'area', name: 'Räknare', visibility: 'all', owner: 'B', geometry: rect(320, -310, 160, 110) },
    { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
    { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
  ],
  components: [
    ...CARDS.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
    ...(['A', 'B'] as const).flatMap((s, i) => [
      { type: TOKEN, cardRef: 'Liv', zone: `counters:${s}`, face: 'front', counter: 20, x: 10, y: 10 + i * 0 },
      { type: TOKEN, cardRef: 'Guld', zone: `counters:${s}`, face: 'front', counter: 3, x: 60, y: 10 },
      { type: TOKEN, cardRef: 'Poäng', zone: `counters:${s}`, face: 'front', counter: 0, x: 110, y: 10 },
    ]),
  ],
}

export class Table {
  readonly initial = initialState('v1', setup, registry)
  state: TableState = this.initial
  readonly log: Applied[] = []
  lastReason: string | null = null
  private n = 0
  private readonly deps: DecideDeps = {
    rng: seededRng(9),
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
}

export function scripted(): Table {
  const t = new Table()
  t.act(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
  t.act(null, { v: 'seat.claim', seat: 'B', name: 'Bo' })
  t.act(null, { v: 'shuffle', pile: 'draw' })
  t.act(null, { v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 4 })
  t.act('A', { v: 'draw', from: 'draw', to: 'mine:A', count: 2 })
  const mine = [...t.state.zones['mine:A']!.order]
  mine.forEach((id, i) => t.act('A', { v: 'move', component: id, to: 'mine:A', x: 20 + i * 80, y: 10 }, { v: 'flip', component: id, face: 'front' }))
  t.act('B', { v: 'draw', from: 'draw', to: 'mine:B', count: 1 })
  t.act(null, { v: 'draw', from: 'draw', to: 'discard', count: 1 })
  return t
}

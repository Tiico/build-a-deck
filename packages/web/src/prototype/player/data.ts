// PROTOTYPE — throwaway. A player's view of a mid-game table, from the real engine, for seat S.
import {
  CARD_STANDARD_63x88,
  TypeRegistry,
  apply,
  counterIds,
  decide,
  initialState,
  project,
  seededRng,
  type SetupDef,
} from '@byd/engine'
import type { Intent, Snapshot } from '@byd/protocol'

const registry = new TypeRegistry([CARD_STANDARD_63x88])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const NAMES = ['Drake', 'Riddare', 'Trollkarl', 'Tjuv', 'Präst', 'Bågskytt', 'Golem', 'Häxa', 'Bard', 'Jätte', 'Vargar', 'Fälla', 'Eldstorm', 'Helande', 'Skugga', 'Gruva', 'Torn', 'Marknad', 'Skog', 'Hamn', 'Kung', 'Drottning', 'Narr', 'Spion', 'Lejon', 'Örn', 'Orm', 'Björn', 'Räv', 'Uggla']
export const BODY: Record<string, string> = {
  Drake: 'Flygande. När Drake anfaller: gör 2 skada på alla motståndare.',
  Riddare: 'Sköld 1. Kostar 1 mindre om du kontrollerar ett Torn.',
  Trollkarl: 'När du spelar Trollkarl: dra ett kort.',
  Tjuv: 'Ta ett slumpmässigt kort från en motståndares hand.',
  Präst: 'Hela 3 liv. Om du har färre än 5 liv: hela 5 i stället.',
  Bågskytt: 'Räckvidd. Gör 1 skada på valfri varelse.',
  Golem: 'Kan inte anfalla den rundan den spelas.',
  Häxa: 'Förvandla en varelse till en Groda (1/1) till rundans slut.',
}
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })
const SEATS = ['N', 'E', 'S', 'W']
export const NAMES_BY_SEAT: Record<string, string> = { N: 'Ada', E: 'Bo', S: 'Cy', W: 'Di' }

function setup(): SetupDef {
  return {
    seats: SEATS,
    floor: 'table',
    zones: [
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-140, 0) },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(140, 0) },
      { id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-330, -330, 660, 120) },
      { id: 'front:S', kind: 'area', name: 'Framför mig', visibility: 'all', geometry: rect(-250, 200, 500, 110) },
      ...SEATS.map((s, i) => ({ id: `hand:${s}`, kind: 'hand' as const, name: 'Hand', visibility: 'owner' as const, owner: s, returnTo: 'draw', geometry: [rect(-250, -400, 500, 60), rect(540, -250, 60, 500), rect(-250, 340, 500, 60), rect(-600, -250, 60, 500)][i]! })),
    ],
    components: NAMES.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
  }
}

export function buildPlayerScene(): Snapshot {
  let state = initialState('v0.7', setup(), registry)
  const deps = { rng: seededRng(3), ids: counterIds('r'), now: () => new Date().toISOString() }
  let n = 0
  const run = (seat: string | null, ...intents: Intent[]) => {
    const d = decide(state, registry, { id: `p${n++}`, seat, intents }, deps)
    if (!d.ok) throw new Error(d.reason)
    for (const line of d.applied) state = apply(state, registry, line)
  }
  for (const s of SEATS) run(null, { v: 'seat.claim', seat: s, name: NAMES_BY_SEAT[s]! })
  // No shuffle: keep the hand readable with the cards that have body text.
  run(null, { v: 'deal', from: 'draw', to: ['hand:S', 'hand:N', 'hand:E', 'hand:W'], each: 2 })
  run(null, { v: 'draw', from: 'draw', to: 'market', count: 4 })
  run(null, { v: 'draw', from: 'draw', to: 'discard', count: 3 })
  run('S', { v: 'draw', from: 'draw', to: 'hand:S', count: 4 })
  return project(state, registry, 'S')
}

export function hue(cardRef: string): number {
  let h = 0
  for (const ch of cardRef) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// Zone shortcuts (C4): the named zones a card can be sent to from the phone.
export function targets(view: Snapshot) {
  return view.zones
    .filter((z) => z.id !== view.floor && z.kind !== 'hand')
    .map((z) => ({ id: z.id, name: z.name, kind: z.kind, count: z.mode === 'count' ? z.count : z.order.length }))
    .concat([{ id: view.floor, name: 'Bordet', kind: 'area', count: 0 }])
}

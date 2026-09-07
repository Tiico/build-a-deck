// PROTOTYPE — the setup as the editor would hold it (B5, K2), and the table it makes.
import { STANDARD_TYPES, TOKEN_COUNTER, CARD_STANDARD_63x88, TypeRegistry, initialState, project, type SetupDef } from '@byd/engine'
import type { Snapshot } from '@byd/protocol'

export type Zone = { id: string; kind: 'pile' | 'area' | 'hand'; name: string; visibility: 'all' | 'owner' | 'none'; owner?: string; returnTo?: string; geometry: { x: number; y: number; w: number; h: number; rot: number }; shortcut?: { label: string; at: 'top' | 'bottom' } }
export type Setup = { seats: string[]; floor: string; deckZone: string; zones: Zone[]; counters: { name: string; start: number }[] }

export const registry = new TypeRegistry(STANDARD_TYPES)
const SEAT_IDS = ['A', 'B', 'C', 'D', 'E', 'F']
export const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
export const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

// What the wizard makes today, as a starting point: the recipe every variant starts from.
export function recipe(players: number, opts: { mine: boolean; discard: boolean; market: boolean; counters: { name: string; start: number }[] }): Setup {
  const seats = SEAT_IDS.slice(0, Math.max(1, Math.min(6, players)))
  const zones: Zone[] = [
    { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-600, -400, 1200, 800) },
    { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-140, 0), shortcut: { label: 'Lägg underst', at: 'bottom' } },
  ]
  if (opts.discard) zones.push({ id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(140, 0), shortcut: { label: 'Kasta', at: 'top' } })
  if (opts.market) zones.push({ id: 'market', kind: 'area', name: 'Marknad', visibility: 'all', geometry: rect(-260, -200, 520, 120), shortcut: { label: 'Till marknaden', at: 'top' } })
  seats.forEach((seat, i) => {
    const hand = handGeometry(i, seats.length)
    zones.push({ id: `hand:${seat}`, kind: 'hand', name: 'Hand', visibility: 'owner', owner: seat, returnTo: 'draw', geometry: hand })
    if (opts.mine) zones.push({ id: `mine:${seat}`, kind: 'area', name: `Framför ${seat}`, visibility: 'owner', owner: seat, geometry: inFront(hand, edgeOf(i, seats.length)), shortcut: { label: 'Framför mig', at: 'top' } })
    if (opts.counters.length > 0) zones.push({ id: `counters:${seat}`, kind: 'area', name: `Räknare ${seat}`, visibility: 'all', owner: seat, geometry: countersAt(hand, edgeOf(i, seats.length)) })
  })
  return { seats, floor: 'table', deckZone: 'draw', zones, counters: opts.counters }
}

export function edgeOf(i: number, count: number): 'N' | 'E' | 'S' | 'W' {
  const edges = count <= 2 ? ['S', 'N'] : count === 3 ? ['S', 'N', 'E'] : ['S', 'N', 'E', 'W', 'S', 'N']
  return (edges[i] ?? 'S') as 'N' | 'E' | 'S' | 'W'
}
export function handGeometry(i: number, count: number) {
  const edge = edgeOf(i, count)
  const shift = i >= 4 ? 300 : 0
  switch (edge) {
    case 'N': return rect(-250 + shift, -400, 500, 60)
    case 'E': return rect(540, -250 + shift, 60, 500)
    case 'W': return rect(-600, -250 + shift, 60, 500)
    default: return rect(-250 + shift, 340, 500, 60)
  }
}
function inFront(hand: { x: number; y: number; w: number; h: number }, edge: 'N' | 'E' | 'S' | 'W') {
  switch (edge) {
    case 'N': return rect(hand.x, hand.y + hand.h + 10, 380, 100)
    case 'E': return rect(hand.x - 110, hand.y, 100, 380)
    case 'W': return rect(hand.x + hand.w + 10, hand.y, 100, 380)
    default: return rect(hand.x, hand.y - 110, 380, 100)
  }
}
function countersAt(hand: { x: number; y: number; w: number; h: number }, edge: 'N' | 'E' | 'S' | 'W') {
  switch (edge) {
    case 'N': return rect(hand.x + 390, hand.y + hand.h + 10, 110, 100)
    case 'E': return rect(hand.x - 110, hand.y + 390, 100, 110)
    case 'W': return rect(hand.x + hand.w + 10, hand.y + 390, 100, 110)
    default: return rect(hand.x + 390, hand.y - 110, 110, 100)
  }
}

// The table the setup makes, as the screen would show it before anyone sat down: twenty cards
// in the deck zone, and every seat's counters.
export function tableOf(setup: Setup): Snapshot | null {
  const card = { id: CARD_STANDARD_63x88.id, version: 1 }
  const token = { id: TOKEN_COUNTER.id, version: 1 }
  const def: SetupDef = {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({ id: z.id, kind: z.kind, name: z.name, visibility: z.visibility, geometry: z.geometry, ...(z.owner ? { owner: z.owner } : {}), ...(z.returnTo ? { returnTo: z.returnTo } : {}), ...(z.shortcut ? { shortcut: z.shortcut } : {}) })),
    components: [
      ...Array.from({ length: 20 }, (_, i) => ({ type: card, cardRef: `Kort ${i + 1}`, zone: setup.deckZone, face: 'back' })),
      ...setup.seats.flatMap((s) => setup.zones.some((z) => z.id === `counters:${s}`) ? setup.counters.map((c, i) => ({ type: token, cardRef: c.name, zone: `counters:${s}`, face: 'front', counter: c.start, x: 8 + (i % 3) * 32, y: 8 + Math.floor(i / 3) * 32 })) : []),
    ],
  }
  try {
    return project(initialState('v1', def, registry), registry, null)
  } catch {
    return null
  }
}

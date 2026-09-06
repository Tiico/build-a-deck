import type { Intent, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { zoneAt } from '../zones.js'

// Card size in table millimetres. The type registry knows the real size; until the renderer
// reads it from there, the standard card is the only type that exists.
export const CARD_MM = { w: 63, h: 88 }

export type Point = { x: number; y: number }
export type DragTarget = { kind: 'card'; id: string } | { kind: 'pileTop'; pile: string } | { kind: 'pile'; pile: string }
export type Drag = {
  target: DragTarget
  // Cards moving together (a card drag); their absolute positions when the drag began.
  ids: string[]
  origin: Record<string, Point>
  // Where the pointer went down and where it is now, in table millimetres.
  grab: Point
  at: Point
}
export type Hit = { kind: 'card'; id: string; zone: string } | { kind: 'pile'; id: string }

// What a drop means (K1, K2): onto a loose card → stack; onto a pile → join it on top; inside a
// zone rectangle → move there; anywhere else → free placement on the floor. The top card of a
// pile goes the same way, as a split; a whole pile moves as one unit.
export function dropIntents(view: Snapshot, d: Drag): Intent[] {
  const zones = new Map(view.zones.map((z) => [z.id, z]))
  const dx = d.at.x - d.grab.x
  const dy = d.at.y - d.grab.y
  if (d.target.kind === 'pile') {
    const z = zones.get(d.target.pile)
    if (!z) return []
    const x = z.geometry.x + dx
    const y = z.geometry.y + dy
    const under = zones.get(zoneAt(view.zones, view.floor, x, y).zone)
    return [{ v: 'movePile', pile: z.id, to: under?.kind === 'area' ? under.id : view.floor, x, y }]
  }
  if (d.target.kind === 'pileTop') {
    const pile = zones.get(d.target.pile)
    if (!pile) return []
    const hit = hitAt(view, d.at, new Set(), pile.id)
    if (hit?.kind === 'pile') return [{ v: 'split', pile: pile.id, at: 1, to: hit.id }]
    // Onto a loose card: the pile is named as the source (K15), since a hidden pile gives no id.
    if (hit?.kind === 'card') return [{ v: 'stack', component: { top: pile.id }, onto: hit.id }]
    const dest = zones.get(zoneAt(view.zones, view.floor, d.at.x, d.at.y).zone)
    if (dest?.kind === 'hand') return [{ v: 'split', pile: pile.id, at: 1, to: dest.id }]
    return [{ v: 'split', pile: pile.id, at: 1, x: d.at.x, y: d.at.y }]
  }
  const moving = new Set(d.ids)
  const hit = hitAt(view, d.at, moving, null)
  if (d.ids.length === 1 && hit?.kind === 'card') return [{ v: 'stack', component: d.ids[0] ?? '', onto: hit.id }]
  if (hit?.kind === 'pile') return d.ids.map((id): Intent => ({ v: 'move', component: id, to: hit.id }))
  return d.ids.map((id): Intent => {
    const o = d.origin[id] ?? d.grab
    const dest = zoneAt(view.zones, view.floor, o.x + dx, o.y + dy)
    return { v: 'move', component: id, to: dest.zone, x: dest.x, y: dest.y }
  })
}

// The topmost loose card, else the pile, under a point — ignoring what is being dragged.
export function hitAt(view: Snapshot, p: Point, ignore: ReadonlySet<string>, ignorePile: string | null): Hit | null {
  const zones = new Map(view.zones.map((z) => [z.id, z]))
  for (const c of [...view.components].reverse()) {
    if (ignore.has(c.id)) continue
    const z = zones.get(c.zone)
    if (!z || z.kind !== 'area') continue
    if (inside(p, { x: z.geometry.x + c.x, y: z.geometry.y + c.y })) return { kind: 'card', id: c.id, zone: c.zone }
  }
  for (const z of view.zones) {
    if (z.kind !== 'pile' || z.id === ignorePile) continue
    if (inside(p, { x: z.geometry.x - CARD_MM.w / 2, y: z.geometry.y - CARD_MM.h / 2 })) return { kind: 'pile', id: z.id }
  }
  return null
}

function inside(p: Point, topLeft: Point): boolean {
  return p.x >= topLeft.x && p.x <= topLeft.x + CARD_MM.w && p.y >= topLeft.y && p.y <= topLeft.y + CARD_MM.h
}

export function absoluteOf(view: Snapshot, c: VisibleComponentState): Point {
  const z: ZoneView | undefined = view.zones.find((x) => x.id === c.zone)
  return z ? { x: z.geometry.x + c.x, y: z.geometry.y + c.y } : { x: c.x, y: c.y }
}

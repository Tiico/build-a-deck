import type { Intent, Snapshot, VisibleComponentState, ZoneBeside, ZoneView } from '@byd/protocol'
import { CHIP_MM } from '@byd/server/doc'
import { zoneAt, type Drop } from '../zones.js'
import { union, type Rect } from './camera.js'
import { handExtent, handRotation, type TableMode } from './hand.js'

// Card size in table millimetres. The type registry knows the real size; until the renderer
// reads it from there, the standard card is the only type that exists.
export const CARD_MM = { w: 63, h: 88 }
// A counter's chip (C4), in the same millimetres: drawn by it and kept on the felt by it. The
// recipe already has to know how wide a chip is to centre one in its slot (#89), so the number
// lives there and this is the felt's name for it.
export const TOKEN_MM = CHIP_MM

export type Point = { x: number; y: number }

// The room between a pile and what is split off it, in table millimetres.
export const BESIDE_MM = 12

// Where a split off a pile lands (K14): beside the pile, on the side the pile says (K21). The
// pile's name stands under it and its count rides its top-right corner, in the pile's own frame,
// so the side free of both is the pile's left, and that is what a pile that says nothing means —
// turned with the pile, since its label turns too.
// The point travels in the intent, and the engine centres a new pile on it; but a pile of one is
// no pile (K1) and settles into a loose card whose *corner* is that point. So a single card is
// placed by its corner and a pile by its centre, which is the one way both stand a card's width
// beside the pile. Placing the card by the pile's rule put it half a card lower and further
// along, straight onto the name (#87).
// Above and below are measured in the card's height and not its width: a pile laid over another
// has to clear the long side, and a card's width above a pile is a card lying on its name.
const SIDES: Record<ZoneBeside, number> = { left: 180, right: 0, above: -90, below: 90 }
export function besidePile(pile: { x: number; y: number; rot: number }, cards: number, side: ZoneBeside = 'left'): Point {
  const rad = ((pile.rot + SIDES[side]) * Math.PI) / 180
  const d = (side === 'left' || side === 'right' ? CARD_MM.w : CARD_MM.h) + BESIDE_MM
  const centre = { x: pile.x + d * Math.cos(rad), y: pile.y + d * Math.sin(rad) }
  const at = cards === 1 ? { x: centre.x - CARD_MM.w / 2, y: centre.y - CARD_MM.h / 2 } : centre
  // Whole millimetres in the log, and never the -0 a turned pile's sine leaves behind.
  const mm = (v: number): number => Math.round(v) + 0
  return { x: mm(at.x), y: mm(at.y) }
}

// A chip pile (#89) is not a new kind of thing on the table, only a set of chips that lie on the
// same spot: it travels as one and the ring reaches into it, and the log hears nothing but the
// `move` each chip already travelled by.
export type DragTarget = { kind: 'card'; id: string } | { kind: 'counter'; id: string } | { kind: 'counterPile'; ids: string[] } | { kind: 'pileTop'; pile: string } | { kind: 'pile'; pile: string }
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

// Where a point on the table lands (K2, #65): on a hand's fan as it is drawn → that hand; else
// the smallest area or hand strip that holds it; else the floor. A hand's zone is a 60 mm strip
// along the rim, but what one sees is the fan, which is deeper than the strip and hangs past the
// rim over the wood — and the picture is the truth. So a hand with cards in it receives on its
// fan and nowhere else: the strip beside the fan is felt like any other, and a loose card can be
// laid right up to the fan's edge and not an inch closer. A hand with no cards draws no fan, and
// there the strip still says where the hand is. The wood is no surface a card can be laid *on*
// (#66); a hand drawn out over it is still that hand.
export function dropAt(view: Snapshot, mode: TableMode, p: Point): Drop {
  const floor = floorOf(view)
  const fanned = new Set<string>()
  for (const z of view.zones) {
    if (z.kind !== 'hand') continue
    const fan = handExtent(z, floor, handRotation(z, floor, mode))
    if (!fan) continue
    fanned.add(z.id)
    if (p.x >= fan.x && p.x <= fan.x + fan.w && p.y >= fan.y && p.y <= fan.y + fan.h) return { zone: z.id, x: p.x - z.geometry.x, y: p.y - z.geometry.y }
  }
  return zoneAt(view.zones.filter((z) => !fanned.has(z.id)), view.floor, p.x, p.y)
}

// How far a box must move to lie on the felt (C5, K2, #66): the frame around the felt is drawn in
// screen pixels outside the millimetres a drop is measured in, and nothing lies *on* it, so what
// would come to rest past the floor's edge is drawn back until it lies on the floor, whole. The
// box is in the floor's own coordinates, where the felt runs from (0, 0) to (w, h), and the
// answer is the shift that takes it to its nearest place there.
export function ontoFelt(floor: ZoneView, box: Rect): Point {
  const g = floor.geometry
  const clamp = (v: number, hi: number): number => Math.min(Math.max(v, 0), Math.max(hi, 0))
  return { x: clamp(box.x, g.w - box.w) - box.x, y: clamp(box.y, g.h - box.h) - box.y }
}

// What a drop means (K1, K2): onto a loose card → stack; onto a pile → join it on top; on a
// hand's fan or inside a zone rectangle → move there; anywhere else → free placement on the
// floor. The top card of a pile goes the same way, as a split; a whole pile moves as one unit.
export function dropIntents(view: Snapshot, d: Drag, mode: TableMode): Intent[] {
  const zones = new Map(view.zones.map((z) => [z.id, z]))
  const at = (p: Point): Drop => dropAt(view, mode, p)
  const dx = d.at.x - d.grab.x
  const dy = d.at.y - d.grab.y
  if (d.target.kind === 'pile') {
    const z = zones.get(d.target.pile)
    if (!z) return []
    const centre = { x: z.geometry.x + dx, y: z.geometry.y + dy }
    const under = zones.get(at(centre).zone)
    const to = under?.kind === 'area' ? under : floorOf(view)
    // A pile travels by its centre, and on the floor it comes to rest on the felt (#66).
    const s = keptOnFelt(view, to.id, { x: centre.x - CARD_MM.w / 2 - to.geometry.x, y: centre.y - CARD_MM.h / 2 - to.geometry.y, ...CARD_MM })
    return [{ v: 'movePile', pile: z.id, to: to.id, x: centre.x + s.x, y: centre.y + s.y }]
  }
  // A chip is not a card (C4): it joins no pile and stacks on nothing, so a drop means the one
  // thing it can mean — the counter is now at the point it was let go of, in whatever zone that
  // point falls in. The verb is `move`, the same one a card travels by; nothing new is invented.
  if (d.target.kind === 'counter' || d.target.kind === 'counterPile') {
    // A pile of chips lies on one spot and travels to one spot, so the whole of it is that one
    // chip's answer said once for each chip. Nothing here knows the word "pile" (#89).
    const ids = d.target.kind === 'counter' ? [d.target.id] : d.target.ids
    const o = d.origin[ids[0] ?? ''] ?? d.grab
    const dest = at({ x: o.x + dx, y: o.y + dy })
    const s = keptOnFelt(view, dest.zone, { x: dest.x, y: dest.y, w: TOKEN_MM, h: TOKEN_MM })
    return ids.map((id): Intent => ({ v: 'move', component: id, to: dest.zone, x: dest.x + s.x, y: dest.y + s.y }))
  }
  if (d.target.kind === 'pileTop') {
    const pile = zones.get(d.target.pile)
    if (!pile) return []
    const hit = hitAt(view, d.at, new Set(), pile.id)
    if (hit?.kind === 'pile') return [{ v: 'split', pile: pile.id, at: 1, to: hit.id }]
    // Onto a loose card: the pile is named as the source (K15), since a hidden pile gives no id.
    if (hit?.kind === 'card') return [{ v: 'stack', component: { top: pile.id }, onto: hit.id }]
    const dest = at(d.at)
    if (zones.get(dest.zone)?.kind === 'hand') return [{ v: 'split', pile: pile.id, at: 1, to: dest.zone }]
    // It settles into a card (K1), and it keeps the point it was picked up by — exactly as a loose
    // card does a few lines below (#223). Cornered at the pointer instead, as this was, the card
    // jumped to the hand's top-left the moment it came off the pile; and since taking the top card
    // off a pile is the commonest drag on a felt, it read as though every card did it.
    //
    // The card it is about is the pile's top, which is drawn centred on the pile's geometry — the
    // same reading `besidePile` makes when it says a pile travels by its centre and a lone card
    // settles by its corner. Which zone it lands in is still the pointer's to decide (#74); only
    // where in that zone it comes to rest is the grip's.
    const was = { x: pile.geometry.x - CARD_MM.w / 2, y: pile.geometry.y - CARD_MM.h / 2 }
    const corner = { x: was.x + d.at.x - d.grab.x, y: was.y + d.at.y - d.grab.y }
    // On the felt and not past its edge (#66), asked in the zone's own coordinates — which is
    // where the pointer's own place in it stands, shifted by the grip.
    const s = keptOnFelt(view, dest.zone, { x: dest.x + corner.x - d.at.x, y: dest.y + corner.y - d.at.y, ...CARD_MM })
    return [{ v: 'split', pile: pile.id, at: 1, x: corner.x + s.x, y: corner.y + s.y }]
  }
  const moving = new Set(d.ids)
  const hit = hitAt(view, d.at, moving, null)
  if (d.ids.length === 1 && hit?.kind === 'card') return [{ v: 'stack', component: d.ids[0] ?? '', onto: hit.id }]
  if (hit?.kind === 'pile') return d.ids.map((id): Intent => ({ v: 'move', component: id, to: hit.id }))
  // The pointer decides (K2), as it already does for the top of a pile just above. Asking instead
  // about the card's own stored corner put the deciding point half a card's width west and half
  // its height north of what the hand was aiming at, which pulled a drop back into the hand along
  // the south and east rims and pushed it out of the hand along the north and west ones — one
  // answer at a rim and another at the rim opposite, from a point nobody can see (#74).
  const dest = at(d.at)
  // Where in that zone the card comes to rest is still where it was dragged to: the pointer's
  // own place in the zone, offset by where in the card it was picked up.
  const rest = d.ids.map((id) => {
    const o = d.origin[id] ?? d.grab
    return { id, x: dest.x + o.x - d.grab.x, y: dest.y + o.y - d.grab.y }
  })
  // On the felt and not past its edge (#66): what is dragged together is drawn back together, so
  // the cards keep their places among themselves.
  const box = union(rest.map((r) => ({ x: r.x, y: r.y, ...CARD_MM })))
  const s = box ? keptOnFelt(view, dest.zone, box) : { x: 0, y: 0 }
  return rest.map((r): Intent => ({ v: 'move', component: r.id, to: dest.zone, x: r.x + s.x, y: r.y + s.y }))
}

// The shift that keeps a box on the felt once it has landed on the floor, and none anywhere else
// (#66). The box is in the zone's own coordinates, which is how a `move` names a place; a zone
// that is not the floor keeps what it is given, since the felt is the floor's edge and no other's.
export function keptOnFelt(view: Snapshot, zone: string, box: Rect): Point {
  return zone === view.floor ? ontoFelt(floorOf(view), box) : { x: 0, y: 0 }
}

function floorOf(view: Snapshot): ZoneView {
  const floor = view.zones.find((z) => z.id === view.floor)
  if (!floor) throw new Error(`floor ${view.floor} is not among the zones`)
  return floor
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

import type { Intent, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { CARD_MM } from './drop.js'

// Playing with a keyboard, variant C — "adressen" (#1, #2). Everything on the felt and in the
// hand is a control with a name; Enter opens a panel of what can be done and where it can go.
//
// Every name here comes out of `project` in `packages/engine`, the same filter the wire is
// tested on (B6, D1, D4). A card this view may not see has no `cardRef` to read, so it is
// `Dolt kort` and nothing more — not because this file hides it, but because there is nothing
// here to hide. The keyboard therefore learns exactly what the pointer learns.

export const HIDDEN = 'Dolt kort'

// What a keyboard may stand on, in reading order: down the felt, then across. Hands are not
// here — they are destinations with names, not places to stand.
export type Thing =
  | { key: string; kind: 'card'; id: string; name: string; zone: string }
  | { key: string; kind: 'pileTop'; pile: string; name: string }
  | { key: string; kind: 'pile'; pile: string; name: string; count: number }

export const cardName = (c: VisibleComponentState | undefined): string => c?.cardRef ?? HIDDEN
export const zoneName = (view: Snapshot, id: string): string => view.zones.find((z) => z.id === id)?.name ?? id
export const countOf = (z: ZoneView): number => (z.mode === 'count' ? z.count : z.order.length)
const topIdOf = (z: ZoneView): string | undefined => (z.mode === 'order' ? z.order[0] : z.top)
export const topOf = (view: Snapshot, z: ZoneView): VisibleComponentState | undefined =>
  view.components.find((c) => c.id === topIdOf(z))

// A card's place on the felt, in table millimetres, for the reading order alone.
function absolute(view: Snapshot, c: VisibleComponentState): { x: number; y: number } {
  const z = view.zones.find((x) => x.id === c.zone)
  return z ? { x: z.geometry.x + c.x, y: z.geometry.y + c.y } : { x: c.x, y: c.y }
}

export function thingsOn(view: Snapshot): Thing[] {
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  const placed = view.components
    .filter((c) => areas.has(c.zone))
    .map((c) => ({ at: absolute(view, c), thing: { key: `card:${c.id}`, kind: 'card' as const, id: c.id, name: cardName(c), zone: c.zone } }))
  const piles = view.zones
    .filter((z) => z.kind === 'pile')
    .flatMap((z) => {
      const at = { x: z.geometry.x, y: z.geometry.y }
      return [
        { at, thing: { key: `top:${z.id}`, kind: 'pileTop' as const, pile: z.id, name: cardName(topOf(view, z)) } },
        { at, thing: { key: `pile:${z.id}`, kind: 'pile' as const, pile: z.id, name: z.name, count: countOf(z) } },
      ]
    })
  return [...placed, ...piles]
    .sort((a, b) => (Math.abs(a.at.y - b.at.y) > 45 ? a.at.y - b.at.y : a.at.x - b.at.x))
    .map((e) => e.thing)
}

// The sentence a reader hears when focus lands on a thing.
export function labelOf(view: Snapshot, t: Thing): string {
  if (t.kind === 'card') {
    const c = view.components.find((x) => x.id === t.id)
    return `${t.name}, kort i ${zoneName(view, t.zone)}${c && c.rot % 360 !== 0 ? ', vridet' : ''}`
  }
  if (t.kind === 'pileTop') {
    const z = view.zones.find((x) => x.id === t.pile)
    return z && countOf(z) === 0 ? `${zoneName(view, t.pile)}, tom` : `Översta kortet i ${zoneName(view, t.pile)}: ${t.name}`
  }
  return `${zoneName(view, t.pile)}, hela högen, ${t.count} kort`
}

// What every node on the felt is called, keyed the way the renderer knows it. The sentence ends
// by saying what Enter does, because a control that opens a panel should say so.
export function feltLabels(view: Snapshot): Map<string, string> {
  return new Map(thingsOn(view).map((t) => [t.key, `${labelOf(view, t)}. Enter öppnar handlingar.`]))
}

// ================================================================================================
// The verbs. The vocabulary in `packages/protocol` is closed and physical, so the keyboard says
// exactly the verbs the pointer's ring says and never a new one: `move`, `stack`, `split`,
// `movePile`, `flip`, `rotate`, `shuffle`, `reveal`.

// An action the panel offers. `intents` is null when the table cannot be asked for it right now
// — an empty pile has nothing to shuffle — and `look` is the one entry that sends nothing and
// only opens the card on this screen (K8).
export type Act = { key: string; label: string; hint?: string; intents: Intent[] | null; look?: string }

export function verbsFor(view: Snapshot, t: Thing): Act[] {
  if (t.kind === 'card') {
    const c = view.components.find((x) => x.id === t.id)
    if (!c) return []
    return [
      { key: 'flip', label: 'Vänd', intents: [{ v: 'flip', component: c.id, face: c.face === 'front' ? 'back' : 'front' }] },
      { key: 'rotate', label: 'Vrid 90°', intents: [{ v: 'rotate', component: c.id, rot: (c.rot + 90) % 360 }] },
      { key: 'reveal', label: 'Avslöja', hint: 'visar kortet för alla', intents: c.cardRef === null ? [{ v: 'reveal', components: [c.id] }] : null },
      { key: 'look', label: 'Titta', hint: 'bara på den här skärmen', intents: [], look: c.id },
    ]
  }
  const z = view.zones.find((x) => x.id === t.pile)
  if (!z) return []
  const n = countOf(z)
  const top = topOf(view, z)
  if (t.kind === 'pileTop') {
    return [
      // The top is flipped by naming the pile (K15) — a hidden pile grants no id to say instead.
      { key: 'flipTop', label: 'Vänd översta', intents: n > 0 ? [{ v: 'flip', component: { top: z.id }, face: top?.face === 'front' ? 'back' : 'front' }] : null },
      { key: 'look', label: 'Titta på översta', hint: 'bara på den här skärmen', intents: top ? [] : null, ...(top ? { look: top.id } : {}) },
    ]
  }
  return [
    { key: 'shuffle', label: 'Blanda', intents: n > 1 ? [{ v: 'shuffle', pile: z.id }] : null },
    ...(view.seat === null ? [] : [{ key: 'toHand', label: 'Dra 1 till min hand', intents: n > 0 ? [{ v: 'split' as const, pile: z.id, at: 1, to: `hand:${view.seat}` }] : null }]),
    { key: 'half', label: 'Dela på hälften', hint: 'ny hög bredvid', intents: n > 1 ? [{ v: 'split', pile: z.id, at: Math.ceil(n / 2), x: z.geometry.x + CARD_MM.w + 14, y: z.geometry.y }] : null },
  ]
}

// ================================================================================================
// The address itself: the places that have a name at all. Zones by their names, the piles, the
// hands, the floor as "Bordet", and every loose card as "På <kort>", which is `stack` (K1).

export type Place = {
  key: string
  label: string
  hint: string
  zone: string
  kind: 'area' | 'pile' | 'hand' | 'card'
  anchor?: VisibleComponentState
}

const handName = (view: Snapshot, z: ZoneView): string => {
  const seat = view.seats.find((s) => s.id === z.owner)
  return z.owner === view.seat ? 'Min hand' : `${seat?.name ?? z.owner ?? ''}s hand`
}

export function placesFor(view: Snapshot, moving: ReadonlySet<string>, sourceZone: string | null): Place[] {
  // A hand nobody is sitting at is not a place to put a card: it would be handed to no one, and
  // it has no name to be offered under either.
  const seated = new Set(view.seats.filter((s) => s.name !== null).map((s) => s.id))
  const zones: Place[] = view.zones
    .filter((z) => !(z.kind === 'area' && z.id === view.floor))
    .filter((z) => z.kind !== 'hand' || (z.owner !== undefined && seated.has(z.owner)))
    .map((z): Place => ({
      key: `z:${z.id}`,
      label: z.kind === 'hand' ? handName(view, z) : z.name,
      hint: z.kind === 'pile' ? `${countOf(z)} kort · överst` : z.kind === 'hand' ? `${countOf(z)} kort` : `${countOf(z)} kort · fri yta`,
      zone: z.id,
      kind: z.kind,
    }))
  const floor = view.zones.find((z) => z.id === view.floor)
  const onFloor: Place[] = floor ? [{ key: `z:${floor.id}`, label: 'Bordet', hint: 'fri yta', zone: floor.id, kind: 'area' }] : []
  const areas = new Set(view.zones.filter((z) => z.kind === 'area').map((z) => z.id))
  const cards: Place[] = view.components
    .filter((c) => areas.has(c.zone) && !moving.has(c.id))
    .map((c): Place => ({ key: `c:${c.id}`, label: `På ${cardName(c)}`, hint: `bildar en hög i ${zoneName(view, c.zone)}`, zone: c.zone, kind: 'card', anchor: c }))
  return [...zones, ...onFloor, ...cards].filter((p) => p.zone !== sourceZone || p.kind === 'card')
}

// ================================================================================================
// Where a keyboard's card actually lands. The protocol wants a point, and a keyboard has none,
// so the client works one out: the next free slot in a row inside the zone, relative to it (K2).
// Two cards played from a keyboard therefore never land on the same millimetre and cover each
// other. This is the prototype's guess, not a product decision — see the open question in I.
export function slotIn(view: Snapshot, zone: string): { x: number; y: number } {
  const z = view.zones.find((x) => x.id === zone)
  const held = view.components.filter((c) => c.zone === zone)
  const perRow = z ? Math.max(1, Math.floor(z.geometry.w / (CARD_MM.w + SLOT_GAP))) : 6
  const i = held.length
  return { x: SLOT_GAP + (i % perRow) * (CARD_MM.w + SLOT_GAP), y: SLOT_GAP + Math.floor(i / perRow) * (CARD_MM.h + SLOT_GAP) }
}

const SLOT_GAP = 14

// The envelope one row of "Flytta till" sends. Never a new verb: a card goes with `move`, onto
// another card with `stack`, the top of a pile with `split` or `stack`, a whole pile with
// `movePile` — and `movePile` and a `split` without a `to` demand x and y that a keyboard has
// not got, so the client invents the zone's own corner. Also an open question in I.
export function intentsForPlace(view: Snapshot, place: Place, thing: Thing, moving: readonly string[]): Intent[] {
  if (thing.kind === 'pile') {
    const z = view.zones.find((x) => x.id === place.zone)
    return [{ v: 'movePile', pile: thing.pile, to: place.kind === 'area' ? place.zone : view.floor, x: (z?.geometry.x ?? 0) + PILE_CORNER, y: (z?.geometry.y ?? 0) + PILE_CORNER }]
  }
  if (thing.kind === 'pileTop') {
    if (place.kind === 'card' && place.anchor) return [{ v: 'stack', component: { top: thing.pile }, onto: place.anchor.id }]
    return [{ v: 'split', pile: thing.pile, at: 1, to: place.zone }]
  }
  if (place.kind === 'card' && place.anchor) {
    const onto = place.anchor.id
    return moving.map((id): Intent => ({ v: 'stack', component: id, onto }))
  }
  const z = view.zones.find((x) => x.id === place.zone)
  // A card played into a public area turns face up as a hand would (K11) — the same two verbs
  // the phone's sheet already sends.
  const isPublic = z?.kind === 'area' && z.mode === 'order'
  return moving.flatMap((id, i): Intent[] => {
    const slot = z?.kind === 'area' ? slotIn(view, place.zone) : null
    const to: Intent = { v: 'move', component: id, to: place.zone, ...(slot ? { x: slot.x + i * (CARD_MM.w + SLOT_GAP), y: slot.y } : {}) }
    return isPublic ? [to, { v: 'flip', component: id, face: 'front' }] : [to]
  })
}

const PILE_CORNER = 90

// Where the focus should stand once the move has been made: on the card itself while it is still
// on the felt, otherwise on the place that swallowed it — which is where the eye goes too.
export function landedKeyFor(view: Snapshot, place: Place, thing: Thing): string {
  const z = view.zones.find((x) => x.id === place.zone)
  if (place.kind === 'card') return `card:${place.anchor?.id ?? ''}`
  if (z?.kind === 'pile') return `top:${z.id}`
  if (z?.kind === 'area' && thing.kind === 'card') return `card:${thing.id}`
  return `top:${place.zone}`
}

// A card in this seat's own hand, for a reader. The hand is not on the felt, so it is not a
// `Thing`; the sentence is the same shape all the same, and marking says so out loud (K3).
export function handLabel(c: VisibleComponentState, marked: boolean): string {
  return `${cardName(c)}, i min hand${marked ? ', markerat' : ''}. Enter öppnar handlingar.`
}

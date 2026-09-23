import type {
  ComponentId,
  ComponentRef,
  RewindProposal,
  ComponentSpec,
  FaceId,
  GameVersionId,
  Geometry,
  SeatId,
  TypeRef,
  ZoneId,
  ZoneKind,
  ZoneAction,
  ZoneShortcut,
  ZoneBeside,
} from '@byd/protocol'

// Who may see the faces of components in this zone by default (B6).
// Per-component overrides (shownTo, peekedBy, publicOverride) widen this and are
// cleared whenever the component changes zone.
export type ZoneVisibility = 'all' | 'owner' | 'none'

export type ZoneDef = {
  id: ZoneId
  kind: ZoneKind
  name: string
  visibility: ZoneVisibility
  geometry: Geometry
  owner?: SeatId
  // Hand zones: where the hand is shuffled back into when the seat is released (C9).
  returnTo?: ZoneId
  // The verb the phone shows for playing here (C4), and where in a pile the card goes.
  shortcut?: ZoneShortcut
  // Which side of a pile is "beside it" (K21): where what is split off it lands. Left when the
  // pile says nothing, which is what every pile meant before (#87).
  beside?: ZoneBeside
  // What a player may ask this zone for when they click it (K14, B5). The designer's own, so
  // they travel to every view as they stand.
  actions?: ZoneAction[]
  // The one card of the deck that lies last in this pile (K23): a shuffle leaves it there, and a
  // card of that row that comes back to this pile lies last again. The role is the pile's and
  // not the card's, which is why it is kept here and not on the component.
  bottom?: { cardRef: string; face: FaceId }
}

// `order[0]` is the top of a pile, the leftmost card of a hand, the topmost object of an area.
export type Zone = ZoneDef & {
  order: ComponentId[]
  // Created by stacking during play (K1). Dissolves into `parent` when one component remains.
  dynamic: boolean
  parent?: ZoneId
}

export type ComponentInstance = {
  id: ComponentId
  type: TypeRef
  // Identity: which row of the component table this instance is. This is the secret.
  cardRef: string
  zone: ZoneId
  face: FaceId
  x: number
  y: number
  rot: number
  // Counters and dice both store their current value here.
  counter?: number
  shownTo: SeatId[]
  peekedBy: SeatId[]
  publicOverride: boolean
}

export type Seat = { id: SeatId; name: string | null }

export type { ComponentSpec } from '@byd/protocol'

export type SetupDef = {
  zones: ZoneDef[]
  seats: SeatId[]
  // The background area. Dynamic piles that have no other parent dissolve into it.
  floor: ZoneId
  // Listed order within a zone is the initial order in that zone.
  components: ComponentSpec[]
  // What each card row says in its own columns, by the names the designer gave them. Kept once
  // per row and not once per copy, because identity is the `cardRef` and a question is asked of
  // the identity. It is as secret as `cardRef` is: nothing projects it, so it never reaches a
  // view (B6). A setup without it answers no question, which is what every table built before
  // this field did.
  cards?: Record<string, Record<string, string>>
}

export type TableState = {
  version: GameVersionId
  seq: number
  setup: SetupDef
  zones: Record<ZoneId, Zone>
  components: Record<ComponentId, ComponentInstance>
  seats: Record<SeatId, Seat>
  // Opaque sequential ids for setup. They leak only what an unshuffled physical deck leaks.
  nextId: number
  ended: boolean
  // Whether a physical line has been committed here (#452). Set where the line is applied, so a
  // replay of the same log reaches the same answer — it is a fact about the log and not a flag
  // somebody sets.
  played: boolean
  // A rewind proposed and not yet confirmed (B).
  rewind: RewindProposal | null
}

// The part of a state a rewind restores: the table itself. Seats, version and setup are the
// session's, not the game's, and stay as they are.
export type Table = Pick<TableState, 'zones' | 'components'>

export function must<T>(value: T | undefined | null, message: string): T {
  if (value === undefined || value === null) throw new Error(message)
  return value
}

export function zoneOf(state: TableState, id: ZoneId): Zone {
  return must(state.zones[id], `unknown zone ${id}`)
}

export function componentOf(state: TableState, id: ComponentId): ComponentInstance {
  return must(state.components[id], `unknown component ${id}`)
}

// The bottom card of a pile as it lies now (K23): the last card of the pile's own bottom row,
// if the pile names one and has one. Read where a card is laid into a pile, where a pile is
// shuffled and where it is projected, so all three agree on which card it is.
export function bottomOf(state: TableState, zone: Zone): ComponentId | undefined {
  const bottom = zone.bottom
  if (!bottom || zone.kind !== 'pile') return undefined
  for (let i = zone.order.length - 1; i >= 0; i--) {
    const id = zone.order[i]
    if (id !== undefined && state.components[id]?.cardRef === bottom.cardRef) return id
  }
  return undefined
}

// The component a verb names: an id, or the top of a pile (K15) resolved against this state.
export function resolveRef(state: TableState, ref: ComponentRef): ComponentId {
  if (typeof ref === 'string') return ref
  return must(zoneOf(state, ref.top).order[0], `pile ${ref.top} is empty`)
}

// Shallow-clones the mutable containers so `apply` can mutate the copy and stay pure.
export function cloneState(state: TableState): TableState {
  const zones: Record<ZoneId, Zone> = {}
  for (const [id, z] of Object.entries(state.zones)) zones[id] = { ...z, order: [...z.order] }
  const components: Record<ComponentId, ComponentInstance> = {}
  for (const [id, c] of Object.entries(state.components)) {
    components[id] = { ...c, shownTo: [...c.shownTo], peekedBy: [...c.peekedBy] }
  }
  const seats: Record<SeatId, Seat> = {}
  for (const [id, s] of Object.entries(state.seats)) seats[id] = { ...s }
  return { ...state, zones, components, seats }
}

export function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next: Record<string, T> = {}
  for (const [k, v] of Object.entries(record)) if (k !== key) next[k] = v
  return next
}

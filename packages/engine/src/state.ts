import type {
  ComponentId,
  FaceId,
  GameVersionId,
  Geometry,
  SeatId,
  TypeRef,
  ZoneId,
  ZoneKind,
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

export type ComponentSpec = {
  type: TypeRef
  cardRef: string
  zone: ZoneId
  face: FaceId
  x?: number
  y?: number
  rot?: number
  counter?: number
}

export type SetupDef = {
  zones: ZoneDef[]
  seats: SeatId[]
  // The background area. Dynamic piles that have no other parent dissolve into it.
  floor: ZoneId
  // Listed order within a zone is the initial order in that zone.
  components: ComponentSpec[]
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
}

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

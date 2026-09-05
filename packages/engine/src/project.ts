import type { SeatId, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'
import { componentOf, type ComponentInstance, type TableState } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { canSeeFace, canSeeZoneOrder } from './visibility.js'

// Projects the authoritative state into what one seat is allowed to know.
// This is the only path from state to wire. Nothing else may serialise components.

export function project(state: TableState, registry: TypeRegistry, seat: SeatId | null): Snapshot {
  const zones: ZoneView[] = []
  const components: VisibleComponentState[] = []

  const sortedZones = Object.values(state.zones).sort((a, b) => a.id.localeCompare(b.id))
  for (const z of sortedZones) {
    const base = { id: z.id, kind: z.kind, name: z.name, ...(z.owner !== undefined ? { owner: z.owner } : {}) }
    if (canSeeZoneOrder(z, seat)) {
      zones.push({ mode: 'order', ...base, order: [...z.order] })
      for (const id of z.order) components.push(view(state, registry, componentOf(state, id), seat))
    } else {
      zones.push({ mode: 'count', ...base, count: z.order.length })
      // A component the seat was explicitly granted knowledge of still appears,
      // even though its position inside the zone does not.
      for (const id of z.order) {
        const c = componentOf(state, id)
        if (grantedTo(c, seat)) components.push(view(state, registry, c, seat))
      }
    }
  }
  return { seq: state.seq, seat, zones, components }
}

function grantedTo(c: ComponentInstance, seat: SeatId | null): boolean {
  if (c.publicOverride) return true
  return seat !== null && (c.shownTo.includes(seat) || c.peekedBy.includes(seat))
}

function view(state: TableState, registry: TypeRegistry, c: ComponentInstance, seat: SeatId | null): VisibleComponentState {
  const v: VisibleComponentState = {
    id: c.id,
    type: c.type,
    zone: c.zone,
    face: c.face,
    x: c.x,
    y: c.y,
    rot: c.rot,
    cardRef: canSeeFace(state, registry, c, seat) ? c.cardRef : null,
  }
  if (c.counter !== undefined) v.counter = c.counter
  return v
}

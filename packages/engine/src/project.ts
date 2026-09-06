import type { Activity, Applied, SeatId, Snapshot, VisibleComponentState, ZoneView } from '@byd/protocol'

import { componentOf, type ComponentInstance, type TableState, type Zone } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { canSeeFace, canSeeZoneOrder } from './visibility.js'

// A log line as every view may see it. The outcome never leaves the server: a shuffle's
// re-keying says exactly where each card went, which no one at a physical table knows.
export function projectActivity(line: Applied): Activity {
  const { seq, batch, at, by, intent } = line
  return { seq, batch, at, by, intent }
}

// Projects the authoritative state into what one seat is allowed to know.
// This is the only path from state to wire. Nothing else may serialise components.

export function project(state: TableState, registry: TypeRegistry, seat: SeatId | null): Snapshot {
  const zones: ZoneView[] = []
  const components: VisibleComponentState[] = []

  const sortedZones = Object.values(state.zones).sort((a, b) => a.id.localeCompare(b.id))
  for (const z of sortedZones) {
    if (canSeeZoneOrder(z, seat)) {
      zones.push({ mode: 'order', ...zoneBase(z), order: [...z.order] })
      for (const id of z.order) components.push(view(state, registry, componentOf(state, id), seat))
    } else {
      zones.push({ mode: 'count', ...zoneBase(z), count: z.order.length })
      // A component the seat was explicitly granted knowledge of still appears,
      // even though its position inside the zone does not.
      for (const id of z.order) {
        const c = componentOf(state, id)
        if (grantedTo(c, seat)) components.push(view(state, registry, c, seat))
      }
    }
  }
  const seats = state.setup.seats.map((id) => ({ id, name: state.seats[id]?.name ?? null }))
  return { seq: state.seq, seat, floor: state.setup.floor, seats, zones, components }
}

function zoneBase(z: Zone) {
  return {
    id: z.id,
    kind: z.kind,
    name: z.name,
    geometry: { ...z.geometry },
    dynamic: z.dynamic,
    ...(z.owner !== undefined ? { owner: z.owner } : {}),
  }
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

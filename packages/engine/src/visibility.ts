import type { SeatId } from '@byd/protocol'
import type { ComponentInstance, TableState, Zone } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { zoneOf } from './state.js'

// A `table` connection has seat === null and sees only what is public. An observer (C8) sees
// everything, and everyone at the table knows she is there.

export function canSeeZoneOrder(zone: Zone, seat: SeatId | null, observer = false): boolean {
  if (observer) return true
  switch (zone.visibility) {
    case 'all':
      return true
    case 'owner':
      return seat !== null && zone.owner === seat
    case 'none':
      return false
  }
}

export function canSeeFace(
  state: TableState,
  registry: TypeRegistry,
  component: ComponentInstance,
  seat: SeatId | null,
  observer = false,
): boolean {
  if (observer) return true
  if (component.publicOverride) return true
  if (seat !== null && (component.shownTo.includes(seat) || component.peekedBy.includes(seat))) return true
  const zone = zoneOf(state, component.zone)
  switch (zone.visibility) {
    case 'none':
      return false
    case 'owner':
      return seat !== null && zone.owner === seat
    case 'all': {
      const def = registry.get(component.type)
      return def.faces.length === 1 || component.face === def.contentFace
    }
  }
}

// Overrides are knowledge granted in a place; they do not travel with the component.
export function clearOverrides(component: ComponentInstance): void {
  component.shownTo = []
  component.peekedBy = []
  component.publicOverride = false
}

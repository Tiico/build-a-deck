import type { SeatId } from '@byd/protocol'
import type { ComponentInstance, TableState, Zone } from './state.js'
import type { TypeRegistry } from './typedef.js'
import { bottomOf, zoneOf } from './state.js'

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
  if (faceUpOnTop(state, registry, component)) return true
  if (faceUpAtBottom(state, registry, component)) return true
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

// The card lying face-up on top of a pile is seen by everyone at the table, whatever the pile's
// visibility (K15): that is what a face-down deck with its top card turned over shows. Covered
// or turned back down, it is hidden again.
export function faceUpOnTop(state: TableState, registry: TypeRegistry, component: ComponentInstance): boolean {
  const zone = zoneOf(state, component.zone)
  if (zone.kind !== 'pile' || zone.order[0] !== component.id) return false
  return component.face === registry.get(component.type).contentFace
}

// A pile's bottom card lying face-up is seen by everyone too (K23): its lower edge sticks out
// under the pile, and what sticks out is what a physical pile shows. Only while something lies
// on it — alone in the pile it is the top, and the top's rule answers.
export function faceUpAtBottom(state: TableState, registry: TypeRegistry, component: ComponentInstance): boolean {
  const zone = zoneOf(state, component.zone)
  if (zone.order.length < 2 || bottomOf(state, zone) !== component.id) return false
  return component.face === registry.get(component.type).contentFace
}

// Overrides are knowledge granted in a place; they do not travel with the component.
export function clearOverrides(component: ComponentInstance): void {
  component.shownTo = []
  component.peekedBy = []
  component.publicOverride = false
}

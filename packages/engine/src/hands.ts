import type { ComponentId, SeatId } from '@byd/protocol'
import type { TableState, Zone } from './state.js'

// The hands a released seat gives back, and the pile they return to.
// Null when the seat holds nothing: an empty hand must not shuffle the pile as a side effect.
export function handsReturnedBy(
  state: TableState,
  seat: SeatId,
): { pile: Zone; hands: Zone[]; handComponents: ComponentId[] } | null {
  const hands = Object.values(state.zones).filter((z) => z.kind === 'hand' && z.owner === seat)
  const first = hands[0]
  if (!first?.returnTo) return null
  const pile = state.zones[first.returnTo]
  if (!pile) return null
  const handComponents = hands.flatMap((h) => h.order)
  if (handComponents.length === 0) return null
  return { pile, hands, handComponents }
}

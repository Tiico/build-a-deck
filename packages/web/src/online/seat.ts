import type { Snapshot, ZoneView } from '@byd/protocol'
import type { Rotation } from '../table/geometry.js'

// The online player's table (C2, C5): turned so the seat's own edge is at the bottom, and with
// the seat's own hand folded to a count — the hand is drawn as a fan beside the felt.

export function seatRotation(view: Snapshot, seat: string): Rotation {
  const floor = view.zones.find((z) => z.id === view.floor)
  const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === seat)
  if (!floor || !hand) return 0
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 90 : 270
  return dy > 0 ? 0 : 180
}

export function withoutHand(view: Snapshot, seat: string): Snapshot {
  const id = `hand:${seat}`
  const zones = view.zones.map((z): ZoneView => {
    if (z.id !== id || z.mode !== 'order') return z
    const { order, ...rest } = z
    return { ...rest, mode: 'count', count: order.length }
  })
  return { ...view, zones, components: view.components.filter((c) => c.zone !== id) }
}

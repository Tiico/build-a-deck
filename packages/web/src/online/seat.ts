import type { Snapshot, ZoneView } from '@byd/protocol'
import { CARD_MM, dropAt, keptOnFelt, type Point } from '../table/drop.js'
import type { Rotation } from '../table/geometry.js'
import type { Drop } from '../zones.js'

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

// Where a card dragged up out of the seat's own band comes to rest on the felt (K2, K11): centred
// on the pointer, in whatever the pointer is over as the felt draws it — another seat's fan
// included (#65) — and the pointer decides, not the card's corner (#74). Onto the seat's own hand
// it goes nowhere: that hand is the band the card came out of, and the fan of backs the felt
// shows in its place is a count, not a place to put a card. On the floor it lies on the felt and
// not past its edge (#66).
export function playedAt(view: Snapshot, seat: string, p: Point): Drop | null {
  const dest = dropAt(view, 'table', p)
  if (dest.zone === `hand:${seat}`) return null
  const box = { x: dest.x - CARD_MM.w / 2, y: dest.y - CARD_MM.h / 2, ...CARD_MM }
  const s = keptOnFelt(view, dest.zone, box)
  return { zone: dest.zone, x: box.x + s.x, y: box.y + s.y }
}

import type { Snapshot, ZoneView } from '@byd/protocol'
import { CARD_MM, dropAt, keptOnFelt, type Point } from '../table/drop.js'
import { turnToFit, type Size } from '../table/fit.js'
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

// Which way round the seat's own felt is drawn, once both rules that have an opinion have had
// their say (C5, C8, K9, #76, #77). This is the one place the two are composed, and `/online` is
// the only surface that needs both.
//
// `seatRotation` says which edge is yours and puts it at the bottom (C5). `turnToFit` says a
// table whose shape disagrees with the window's is turned a quarter, so the long side runs the
// long way and the felt fills the width (C8). On a phone they agree — a portrait window and a
// side seat both ask for the quarter turn — and in every landscape window they contradict each
// other, because there the seat's quarter turn stands the table's long side up against the
// window's short one.
//
// **The window wins, and only over the quarter turns.** A seat at the far edge is turned half a
// circle, which leaves the table's shape exactly as it was, so the window has no opinion about it
// and it always stands. A side seat's quarter turn is kept only where `turnToFit` asks for a
// quarter turn anyway.
//
// The window wins on a measurement rather than on a principle: at 1280 x 800 a side seat's
// quarter turn drew a card 17 px across its short side, and no turn drew it 52 (#77, measured on
// the painted box in Chromium). K9's floor for a thing that is dragged and pressed is 45, so the
// turned table is not a smaller table but an unusable one. C5's "your own edge at the bottom" is
// a way of saying which edge is yours, and the felt's marked rim says the same thing for nothing.
//
// Deliberately not a measured threshold that keeps the turn where it "fits": corrected for the
// tilt it never fired at any window in the sample, and a rule that makes a larger window draw a
// smaller card is worse than either half of it alone (#77).
export function seatTurn(view: Snapshot, seat: string, room: Size): Rotation {
  const turn = seatRotation(view, seat)
  const floor = view.zones.find((z) => z.id === view.floor)
  // No window to ask — before the first measurement, and off a browser altogether — leaves C5's
  // own answer standing: there is no evidence to overturn it with.
  if (turn % 180 === 0 || !floor || room.w <= 0 || room.h <= 0) return turn
  return turnToFit({ w: floor.geometry.w, h: floor.geometry.h }, room) === 90 ? turn : 0
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

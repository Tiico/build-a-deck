import type { Snapshot } from '@byd/protocol'

export type Edge = 'N' | 'E' | 'S' | 'W'

// Which edge of the table a seat sits at, from where its hand zone lies relative to the floor.
// Seats without a hand zone fall to the south edge.
export function seatEdge(view: Snapshot, seat: string): Edge {
  const floor = view.zones.find((z) => z.id === view.floor)
  const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === seat)
  if (!floor || !hand) return 'S'
  const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
  const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'E' : 'W'
  return dy > 0 ? 'S' : 'N'
}

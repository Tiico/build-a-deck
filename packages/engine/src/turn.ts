import type { SeatId, Snapshot } from '@byd/protocol'
import type { TableState } from './state.js'

// The seats in turn order (K28), from the setup's first seat and round the table the way the game
// says. Where a seat sits is where its hand lies around the middle of the floor, read the way
// `seatEdge` reads the edge, so two seats on one edge (K18) follow each other along it in the same
// direction as round the table. A seat without a hand sits nowhere, and comes last in the setup's
// own order rather than being placed by a guess.
export function turnOrder(state: TableState): SeatId[] {
  const floor = state.zones[state.setup.floor]
  const angle = new Map<SeatId, number>()
  for (const seat of state.setup.seats) {
    const hand = Object.values(state.zones)
      .filter((z) => z.kind === 'hand' && z.owner === seat)
      .sort((a, b) => a.id.localeCompare(b.id))[0]
    if (!floor || !hand) continue
    const dx = hand.geometry.x + hand.geometry.w / 2 - (floor.geometry.x + floor.geometry.w / 2)
    const dy = hand.geometry.y + hand.geometry.h / 2 - (floor.geometry.y + floor.geometry.h / 2)
    // The table's y grows downwards, so a growing angle is clockwise as the felt is drawn.
    angle.set(seat, Math.atan2(dy, dx))
  }
  const sign = state.setup.turns === 'counterclockwise' ? -1 : 1
  const first = state.setup.seats.find((s) => angle.has(s))
  const start = first === undefined ? 0 : (angle.get(first) ?? 0)
  const round = (seat: SeatId) => {
    const turned = (sign * ((angle.get(seat) ?? 0) - start)) % (2 * Math.PI)
    return turned < 0 ? turned + 2 * Math.PI : turned
  }
  const placed = state.setup.seats.filter((s) => angle.has(s)).sort((a, b) => round(a) - round(b))
  return [...placed, ...state.setup.seats.filter((s) => !angle.has(s))]
}

// The first taken seat after `from` in `order`, round the table, `from` itself last: where the turn
// goes when it is passed on. Null when no seat is taken.
function after(order: readonly SeatId[], from: SeatId, taken: (seat: SeatId) => boolean): SeatId | null {
  const i = order.indexOf(from)
  for (let step = 1; step <= order.length; step++) {
    const seat = order[(i + step) % order.length]
    if (seat !== undefined && taken(seat)) return seat
  }
  return null
}

// Where the turn goes when the seat holding it is left (K28).
export function turnAfter(state: TableState, from: SeatId): SeatId | null {
  return after(turnOrder(state), from, (seat) => state.seats[seat]?.name != null)
}

// The seat «Klar» passes the turn to, as every surface reads it off its own view: the first taken
// seat after the turn. Null for a game without turns and while nobody has the turn.
export function nextTurn(view: Pick<Snapshot, 'turn' | 'seats'>): SeatId | null {
  const turn = view.turn
  if (!turn || turn.seat === null) return null
  return after(turn.order, turn.seat, (seat) => view.seats.some((s) => s.id === seat && s.name !== null))
}

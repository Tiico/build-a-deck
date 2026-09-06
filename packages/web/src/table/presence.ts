import type { Presence, PresenceFrom, SeatId } from '@byd/protocol'

// Presence (K6) as a view sees it: the others at the table, what they carry, where they point.
export type Point = { x: number; y: number }
export type Peer = { id: string; seat: SeatId | null; name: string; cursor: Point | null; drag: { component: string; x: number; y: number } | null; at?: number }
export type Pulse = { id: string; seat: SeatId | null; name: string; x: number; y: number; at: number }
// A card that just moved, and who moved it: the colour it carries for a moment.
export type Recent = { component: string; seat: SeatId | null; at: number }

export const CURSOR_IDLE_MS = 2500
export const PULSE_MS = 1200
export const RECENT_MS = 1600

export type PresenceState = { peers: Record<string, Peer>; pulses: Pulse[] }

export const emptyPresence = (): PresenceState => ({ peers: {}, pulses: [] })

// Folds one relayed message into the state. `name` resolves a seat to what the view calls it.
export function reducePresence(state: PresenceState, from: PresenceFrom, p: Presence, now: number, name: (seat: SeatId | null) => string): PresenceState {
  const prev: Peer = state.peers[from.id] ?? { id: from.id, seat: from.seat, name: name(from.seat), cursor: null, drag: null }
  const peer = { ...prev, name: name(from.seat), at: now }
  switch (p.kind) {
    case 'cursor':
      peer.cursor = { x: p.x, y: p.y }
      break
    case 'away':
      peer.cursor = null
      break
    case 'drag':
      peer.drag = { component: p.component, x: p.x, y: p.y }
      break
    case 'drop':
      peer.drag = null
      break
    case 'point':
      return { ...state, pulses: [...state.pulses, { id: from.id, seat: from.seat, name: name(from.seat), x: p.x, y: p.y, at: now }] }
  }
  const peers: Record<string, Peer> = {}
  for (const [id, other] of Object.entries(state.peers)) if (id !== from.id) peers[id] = other
  if (peer.cursor || peer.drag) peers[from.id] = peer
  return { ...state, peers }
}

// Lets go of what has gone stale: idle cursors, spent pulses.
export function prunePresence(state: PresenceState, now: number): PresenceState {
  const peers: Record<string, Peer> = {}
  for (const [id, peer] of Object.entries(state.peers)) {
    const idle = peer.at !== undefined && now - peer.at > CURSOR_IDLE_MS
    const next = idle ? { ...peer, cursor: null } : peer
    if (next.cursor || next.drag) peers[id] = next
  }
  const pulses = state.pulses.filter((p) => now - p.at < PULSE_MS)
  return { peers, pulses }
}

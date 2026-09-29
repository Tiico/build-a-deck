import type { Activity, Presence, PresenceFrom, SeatId, Snapshot, VisibleComponentState } from '@byd/protocol'

// Presence (K6) as a view sees it: the others at the table, what they carry, where they point.
export type Point = { x: number; y: number }
export type Peer = { id: string; seat: SeatId | null; name: string; cursor: Point | null; drag: { component: string; x: number; y: number } | null; at?: number }
export type Pulse = { id: string; seat: SeatId | null; name: string; x: number; y: number; at: number }
// A card someone held up for the room (K8, #508), and who did: the latest one, until its time is up.
export type Shown = { component: string; seat: SeatId | null; name: string; at: number }
// A card that just moved, and who moved it: the colour it carries for a moment.
export type Recent = { component: string; seat: SeatId | null; at: number }

// Which card a log line is about, when it is about one. Two rooms ask it — the felt, which
// colours a card that just moved (K6), and the TV's inspection panel, which holds up the card the
// last line was about (K8) — so it is answered once. A pile named as the source (K15) hands out
// no component id, and a line about the table rather than about a card names none at all.
export function componentOf(line: Activity): string | null {
  const it = line.intent
  const component = it.v === 'move' || it.v === 'rotate' || it.v === 'flip' || it.v === 'stack' ? it.component : null
  return typeof component === 'string' ? component : null
}

export const CURSOR_IDLE_MS = 2500
export const PULSE_MS = 1200
export const RECENT_MS = 1600
// How long a shown card stands before it goes by itself (#508): long enough to read a card's body
// from the sofa, and short enough that nobody has to get up to take it down.
export const SHOW_MS = 15_000

export type PresenceState = { peers: Record<string, Peer>; pulses: Pulse[]; shown: Shown | null }

export const emptyPresence = (): PresenceState => ({ peers: {}, pulses: [], shown: null })

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
    case 'show':
      return { ...state, shown: { component: p.component, seat: from.seat, name: name(from.seat), at: now } }
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
  const shown = state.shown && now - state.shown.at < SHOW_MS ? state.shown : null
  return { peers, pulses, shown }
}

// The card a screen draws for a `show`, looked up in its own view: only when that view carries the
// face. A card in a hand, face down, or gone from the table is not drawn, whatever was asked.
export function shownCard(view: Snapshot | null, shown: Shown | null): VisibleComponentState | null {
  if (!view || !shown) return null
  const card = view.components.find((c) => c.id === shown.component)
  return card && card.cardRef !== null && card.counter === undefined ? card : null
}

// Whether a card is one the table itself sees face up, and so one a phone may hold up for the room
// (#518): face up in a zone that shows its cards to everyone, or lying face up on top of a pile,
// which everyone sees whatever the pile (K15). A card only its owner may know is never offered —
// the room's screen would have nothing to draw (`shownCard`).
export function forTheRoom(view: Snapshot, card: VisibleComponentState): boolean {
  if (card.cardRef === null || card.counter !== undefined || card.face !== 'front') return false
  const zone = view.zones.find((z) => z.id === card.zone)
  if (!zone || zone.kind === 'hand') return false
  if (zone.visibility === 'all') return true
  return zone.kind === 'pile' && (zone.mode === 'count' ? zone.top === card.id : zone.order[0] === card.id)
}

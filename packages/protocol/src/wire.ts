import { z } from 'zod'
import { Activity, Envelope } from './events.js'
import { ComponentId, SeatId } from './ids.js'
import { Patch, Snapshot } from './patch.js'

// The WebSocket wire format. One connection = one role at one seat (or the table).

// Presence (K6) is ephemeral: what a connection is doing right now, relayed to the others at
// the table and never written to the log. Positions are table millimetres.
export const Presence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cursor'), x: z.number(), y: z.number() }),
  // The pointer left the table or went idle.
  z.object({ kind: z.literal('away') }),
  // A component being carried, and where it is right now; the log says where it lands.
  z.object({ kind: z.literal('drag'), component: ComponentId, x: z.number(), y: z.number() }),
  z.object({ kind: z.literal('drop') }),
  // A pointing pulse: "look here".
  z.object({ kind: z.literal('point'), x: z.number(), y: z.number() }),
])
export type Presence = z.infer<typeof Presence>
// Who said it: the connection's seat, and an id that tells two screens at the table apart.
export const PresenceFrom = z.object({ seat: SeatId.nullable(), id: z.string().min(1) })
export type PresenceFrom = z.infer<typeof PresenceFrom>

export const ClientMessage = z.discriminatedUnion('t', [
  z.object({ t: z.literal('envelope'), envelope: Envelope }),
  z.object({ t: z.literal('presence'), presence: Presence }),
])
export type ClientMessage = z.infer<typeof ClientMessage>

export const ServerMessage = z.discriminatedUnion('t', [
  // Sent on connect and reconnect: the full projection for this seat.
  z.object({ t: z.literal('snapshot'), snapshot: Snapshot }),
  z.object({ t: z.literal('patch'), patch: Patch }),
  // The committed lines behind the preceding patch, redacted for every view alike.
  z.object({ t: z.literal('activity'), lines: z.array(Activity) }),
  // The envelope was committed; these are the seq numbers it produced.
  z.object({ t: z.literal('ack'), id: z.string(), seqs: z.array(z.number().int()) }),
  z.object({ t: z.literal('reject'), id: z.string(), reason: z.string() }),
  // Malformed input or an internal failure; the envelope id when one could be read.
  z.object({ t: z.literal('error'), id: z.string().nullable(), message: z.string() }),
  // The server is going away; reconnect after a moment.
  z.object({ t: z.literal('bye'), reason: z.string() }),
  z.object({ t: z.literal('presence'), from: PresenceFrom, presence: Presence }),
])
export type ServerMessage = z.infer<typeof ServerMessage>

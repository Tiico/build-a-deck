import { z } from 'zod'
import { Envelope } from './events.js'
import { Patch, Snapshot } from './patch.js'

// The WebSocket wire format. One connection = one role at one seat (or the table).

export const ClientMessage = z.discriminatedUnion('t', [z.object({ t: z.literal('envelope'), envelope: Envelope })])
export type ClientMessage = z.infer<typeof ClientMessage>

export const ServerMessage = z.discriminatedUnion('t', [
  // Sent on connect and reconnect: the full projection for this seat.
  z.object({ t: z.literal('snapshot'), snapshot: Snapshot }),
  z.object({ t: z.literal('patch'), patch: Patch }),
  // The envelope was committed; these are the seq numbers it produced.
  z.object({ t: z.literal('ack'), id: z.string(), seqs: z.array(z.number().int()) }),
  z.object({ t: z.literal('reject'), id: z.string(), reason: z.string() }),
  // Malformed input or an internal failure; the envelope id when one could be read.
  z.object({ t: z.literal('error'), id: z.string().nullable(), message: z.string() }),
  // The server is going away; reconnect after a moment.
  z.object({ t: z.literal('bye'), reason: z.string() }),
])
export type ServerMessage = z.infer<typeof ServerMessage>

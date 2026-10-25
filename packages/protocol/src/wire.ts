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
  // «Visa för alla» (K8, #508): a card held up on the room's screen for everyone to read. It names
  // the card and nothing else, and the screen draws it only if its own view already carries the
  // face — so a message can never show what the screen could not see.
  z.object({ kind: z.literal('show'), component: ComponentId }),
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
  // Sent on connect and reconnect: the full projection for this seat, and the most recent
  // committed lines, redacted like `activity`, so a view joining mid-game sees what happened.
  z.object({ t: z.literal('snapshot'), snapshot: Snapshot, activity: z.array(Activity) }),
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
  // This connection is not admitted (DRIFT §9): no token, a revoked one, a wrong host key, or a
  // kick. The server closes after it; the client must not reconnect on its own.
  z.object({ t: z.literal('refused'), reason: z.string() }),
  // The room code (DRIFT §9), to the host's screens only: on connect and whenever it rotates.
  // A rotation changes the host key too (#820), and the screens that are open are handed the new
  // one here so they are not shut out by it; `hostKey` is never sent on connect, and never to a
  // seat, an observer or the lobby.
  z.object({ t: z.literal('room'), code: z.string(), expiresAt: z.string(), hostKey: z.string().min(1).optional() }),
  z.object({ t: z.literal('presence'), from: PresenceFrom, presence: Presence }),
  // Who is watching (C8): sent to everyone on connect and whenever it changes. Observers are
  // never invisible.
  z.object({ t: z.literal('roster'), observers: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })) }),
  // Who this connection was let in as (#1278): the name on the admission its token was bought with,
  // to that connection only. The page's address no longer carries the name, so this is where the
  // phone learns what to sit down as. Sent only to a client that brought its token in the protocol
  // header (`guestProtocols`), since one that put it in the address predates this message.
  z.object({ t: z.literal('admitted'), name: z.string().min(1) }),
])
export type ServerMessage = z.infer<typeof ServerMessage>

// A guest's token never travels in an address (#1278, DRIFT §9): the upgrade is a request, and a
// proxy that logs requests logs their query. `Sec-WebSocket-Protocol` is the one header a page may
// set on a WebSocket, so the token rides there, as a second protocol beside the table's own, which
// the server answers with. A token is base64url, which a protocol name may hold as it is.
//
// The host key rides the same way (#1306), as `deckster.host.<key>`: it opens the table's own view,
// and the upgrade of the table's screen is a request like any other. Every client of this protocol
// offers `deckster`, with or without a secret beside it, which is how the server knows a client
// that understands what it says since #1278 (`admitted`) from one loaded before.
export const TABLE_PROTOCOL = 'deckster'
const TOKEN_PROTOCOL = `${TABLE_PROTOCOL}.token.`
const HOST_PROTOCOL = `${TABLE_PROTOCOL}.host.`
// A protocol name is an HTTP token, and a browser throws on any other; a secret this product made is
// base64url and always is one. Anything else — a key mistyped into an address — is not offered, and
// the door says it needs the key, as it would have of a wrong one.
const sayable = (secret: string | undefined): secret is string => secret !== undefined && /^[A-Za-z0-9_-]+$/.test(secret)
export const tableProtocols = ({ token, host }: { token?: string | undefined; host?: string | undefined } = {}): string[] => [
  TABLE_PROTOCOL,
  ...(sayable(token) ? [`${TOKEN_PROTOCOL}${token}`] : []),
  ...(sayable(host) ? [`${HOST_PROTOCOL}${host}`] : []),
]
export const guestProtocols = (token: string): string[] => tableProtocols({ token })
const offered = (header: string | undefined): string[] => (header ?? '').split(',').map((name) => name.trim())
const secretOf = (header: string | undefined, prefix: string): string | null => {
  const name = offered(header).find((n) => n.startsWith(prefix) && n.length > prefix.length)
  return name === undefined ? null : name.slice(prefix.length)
}
export const tokenOfProtocols = (header: string | undefined): string | null => secretOf(header, TOKEN_PROTOCOL)
export const hostKeyOfProtocols = (header: string | undefined): string | null => secretOf(header, HOST_PROTOCOL)
// Whether the client speaks the protocol at all: one loaded before #1278 offers nothing.
export const offersTableProtocol = (header: string | undefined): boolean => offered(header).includes(TABLE_PROTOCOL)

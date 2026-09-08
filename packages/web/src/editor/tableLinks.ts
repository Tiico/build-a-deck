import type { SeatId } from '@byd/protocol'

// The ways into a table (#19), built in one place so the editor's header link, the Bord tab and
// the phone's QR all point at the same table with the same address. `server` is the editor's own
// `?server=` (an HTTP origin) or null for this origin; the table's views speak WebSocket, so it
// travels as `ws://`.
export const DESIGNER = 'Designern'

const to = (path: string, q: URLSearchParams, server: string | null): string => {
  if (server) q.set('server', server.replace(/^http/, 'ws'))
  return `${path}?${q.toString()}`
}

export const tvUrl = (session: string, server: string | null, host?: string, owner = false): string =>
  to('/table', new URLSearchParams({ session, ...(host ? { host } : {}), mode: 'tv', ...(owner ? { owner: '1' } : {}) }), server)
export const tableModeUrl = (session: string, server: string | null, owner = false): string =>
  to('/table', new URLSearchParams({ session, mode: 'table', ...(owner ? { owner: '1' } : {}) }), server)
export const onlineUrl = (session: string, server: string | null, seat: SeatId, owner = false): string =>
  to('/online', new URLSearchParams({ session, seat, name: DESIGNER, ...(owner ? { owner: '1' } : {}) }), server)
export const observeUrl = (session: string, server: string | null, owner = false): string =>
  to('/observe', new URLSearchParams({ session, name: DESIGNER, ...(owner ? { owner: '1' } : {}) }), server)
// What the QR on the TV encodes (K12): the room code opens the phone's live seat picker.
export const joinUrl = (code: string, server: string | null): string => `${location.origin}${to('/join', new URLSearchParams({ code }), server)}`

// What a table is called where a person has to tell two of them apart. The session id is a
// UUID; its head is enough to match the code the TV shows.
export const tableName = (session: string): string => session.slice(0, 8)

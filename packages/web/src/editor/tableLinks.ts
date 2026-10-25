import type { SeatId } from '@byd/protocol'
import type { Lang } from '../i18n/index.js'

// The ways into a table (#19), built in one place so the editor's header link, the Bord tab and
// Mina spel all point at the same table with the same address. `server` is the editor's own
// `?server=` (an HTTP origin) or null for this origin; the table's views speak WebSocket, so it
// travels as `ws://`.

const to = (path: string, q: URLSearchParams, server: string | null): string => {
  if (server) q.set('server', server.replace(/^http/, 'ws'))
  return `${path}?${q.toString()}`
}

// `lang` is the host's language (#756, A4): the table is the host's screen and speaks it, so every
// way the host opens it carries it, and the table remembers it (`rememberTableLang`). The phones'
// way in carries none — a player follows her own browser.
const spoken = (lang: Lang | undefined) => (lang ? { lang } : {})
// The host key is in the fragment (#1306, DRIFT §9), which the browser sends in no request and no
// `Referer`; the screen takes it out of the address on arrival (`takeHostKey`).
export const tvUrl = (session: string, server: string | null, host?: string, owner = false, lang?: Lang): string =>
  `${to('/table', new URLSearchParams({ session, mode: 'tv', ...(owner ? { owner: '1' } : {}), ...spoken(lang) }), server)}${host ? `#host=${host}` : ''}`
// The host's own seat (L77), with the room code along so the seat knows the address it hands on. Her
// name is in no address (#1306): she sits down under the name she gave «Hur sitter ni?», which this
// browser remembers by table (`hostSeat.ts`), and else under her account's.
export const onlineUrl = (session: string, server: string | null, seat: SeatId, owner = false, lang?: Lang, as: { code?: string } = {}): string =>
  to('/online', new URLSearchParams({ session, seat, ...(owner ? { owner: '1' } : {}), ...(as.code ? { code: as.code } : {}), ...spoken(lang) }), server)

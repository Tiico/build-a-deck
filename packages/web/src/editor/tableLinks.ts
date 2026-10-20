import type { SeatId } from '@byd/protocol'
import { translate, type Lang, type T } from '../i18n/index.js'

// The ways into a table (#19), built in one place so the editor's header link, the Bord tab and
// the phone's QR all point at the same table with the same address. `server` is the editor's own
// `?server=` (an HTTP origin) or null for this origin; the table's views speak WebSocket, so it
// travels as `ws://`.
// What the designer is called at their own table. It is their name to everyone else there, so
// it is written in the language they are working in (A4).
export const designerName = (t: T = (key, params) => translate('sv', key, params)): string => t('tables.designer')

const to = (path: string, q: URLSearchParams, server: string | null): string => {
  if (server) q.set('server', server.replace(/^http/, 'ws'))
  return `${path}?${q.toString()}`
}

// `lang` is the host's language (#756, A4): the table is the host's screen and speaks it, so every
// way the host opens it carries it, and the table remembers it (`rememberTableLang`). The phones'
// way in carries none — a player follows her own browser.
const spoken = (lang: Lang | undefined) => (lang ? { lang } : {})
export const tvUrl = (session: string, server: string | null, host?: string, owner = false, lang?: Lang): string =>
  to('/table', new URLSearchParams({ session, ...(host ? { host } : {}), mode: 'tv', ...(owner ? { owner: '1' } : {}), ...spoken(lang) }), server)
export const tableModeUrl = (session: string, server: string | null, owner = false, lang?: Lang): string =>
  to('/table', new URLSearchParams({ session, mode: 'table', ...(owner ? { owner: '1' } : {}), ...spoken(lang) }), server)
export const onlineUrl = (session: string, server: string | null, seat: SeatId, owner = false, t?: T, lang?: Lang): string =>
  to('/online', new URLSearchParams({ session, seat, name: designerName(t), ...(owner ? { owner: '1' } : {}), ...spoken(lang) }), server)
export const observeUrl = (session: string, server: string | null, owner = false, t?: T, lang?: Lang): string =>
  to('/observe', new URLSearchParams({ session, name: designerName(t), ...(owner ? { owner: '1' } : {}), ...spoken(lang) }), server)
// What the QR on the TV encodes (K12): the room code opens the phone's live seat picker.
export const joinUrl = (code: string, server: string | null): string => `${location.origin}${to('/join', new URLSearchParams({ code }), server)}`

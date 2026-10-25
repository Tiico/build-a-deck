// The tabs a game opens in (#1217, L80), and the way back from a table to the game's editor.
//
// A table opens beside the editor, never over it (L5, L64): the designer edits in one tab and
// watches the table in another. Every way in used to open a tab of its own, so a table opened
// twice was two tabs, and no table had a way back to anything — the way back was the browser's
// tab strip. So the tabs are named instead. The editor's tab carries its game's name, each table's
// tab carries its table and its view, and a link that targets a name brings that tab out when it
// is there and opens it when it is not.
//
// A name is only found by a tab that shares a browsing context group with it, which is exactly
// what `noopener` takes away: these ways in open with an opener, or the way back opens a second
// editor. They are the app's own pages on its own origin, so nothing is reached that could not be.
//
// It sits at the root, beside `room.ts`, because both the editor and every table surface use it.

import type { SeatId, Seating } from '@byd/protocol'
import type { Lang } from './i18n/index.js'
import { onlineUrl, tvUrl } from './editor/tableLinks.js'

export type TableView = 'tv' | 'table' | 'online' | 'observe'

export const editorTab = (project: string): string => `byd-editor-${project}`
export const tableTab = (session: string, view: TableView): string => `byd-${view}-${session}`

// The editor's address as Mina spel opens it, so a tab that has the editor open is at this very
// address. The fragment makes following the link a jump within that page and not a load: the
// editor is brought out as it stands, its unsaved work and its open panels with it. A table's
// address carries a development server as WebSocket, which the editor speaks as HTTP.
export function editorWay(project: string, server: string | null): { href: string; target: string } {
  const q = new URLSearchParams({ project })
  if (server) q.set('server', server.replace(/^ws/, 'http'))
  return { href: `/editor?${q.toString()}#`, target: editorTab(project) }
}

// The host's own seat at a table of computers she started in this browser (L77, #1286): the seat
// she sat down at and the name she sat under, by table. «Öppna bordet» leads her back to it. A
// browser that refuses storage simply forgets, and the way in is then the room's own address.
const HOST_SEATS = 'byd.hostSeat'
type HostSeat = { seat: SeatId; name: string }
const hostSeats = (): Record<string, HostSeat> => {
  try {
    return (JSON.parse(localStorage.getItem(HOST_SEATS) ?? 'null') as Record<string, HostSeat> | null) ?? {}
  } catch {
    return {}
  }
}
export function rememberHostSeat(session: string, seat: HostSeat): void {
  try {
    localStorage.setItem(HOST_SEATS, JSON.stringify({ ...hostSeats(), [session]: seat }))
  } catch {
    // Forgotten, as everything else the tool remembers is in a browser without storage.
  }
}
export const hostSeatAt = (session: string): HostSeat | null => hostSeats()[session] ?? null

// A table as its ways in know it: how its people sit (#1286), when the host was asked, and the code
// it is reached by while it lets people in.
export type TableAt = { id: string; seating?: Seating | undefined; code?: string | undefined }

// The one way in a table has for whoever may start one (#1286, variant B): what the table is. A
// table around a TV opens at its screen; a table of computers at the host's own seat, when she sat
// down in this browser, and otherwise at the room's own address, where a seat is chosen like any
// guest's. A table from before the question opens at its screen, as every table used to.
// `server` is the editor's HTTP origin, as `tableLinks` takes it.
export function tableWay(table: TableAt, server: string | null, lang?: Lang): { href: string; target: string } {
  if (table.seating === 'computer') {
    const mine = hostSeatAt(table.id)
    if (mine) return { href: onlineUrl(table.id, server, mine.seat, true, undefined, lang, { name: mine.name, ...(table.code ? { code: table.code } : {}) }), target: tableTab(table.id, 'online') }
    if (table.code) return { href: roomPath(table.code, server), target: tableTab(table.id, 'online') }
  }
  return { href: tvUrl(table.id, server, undefined, true, lang), target: tableTab(table.id, 'tv') }
}

// The room's own address, `/KOD` (#675), with the development server as the table's WebSocket.
export const roomPath = (code: string, server: string | null): string => `/${code}${server ? `?${new URLSearchParams({ server: server.replace(/^http/, 'ws') }).toString()}` : ''}`

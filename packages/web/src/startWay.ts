import type { SeatId, Seating } from '@byd/protocol'
import type { Lang } from './i18n/index.js'
import { onlineUrl, tvUrl } from './editor/tableLinks.js'
import { rememberStart, type StartAnswer } from './editor/startAnswer.js'
import { hostSeatAt, rememberHostSeat } from './hostSeat.js'
import { tableTab } from './ways.js'

// Every start of a table, wherever it is pressed (#1286, variant B): the editor's «Starta bord»,
// its «Nytt bord», the Bord tab's «Starta nytt bord» and Mina spel's. Each asks «Hur sitter ni?»
// (L77) first, and then this: the table is started with the answer, which the table keeps, and the
// screen the answer gives the host is opened beside the page — the TV view for a room around one
// screen, or her own seat at `/online` for a table of computers.
//
// It sits at the root, beside `ways.ts`, because both the editor and Mina spel start and open
// tables. It is not in `ways.ts`, which the table surfaces load: what it builds a way with is the
// editor's (`tableLinks`), and a felt that loaded it would carry the editor's words (#760).

export type Started = { id: string; code: string; hostKey: string; hostSeat?: SeatId | undefined }

// Where the host goes once the table has started, and the seat she sits at remembered for the next
// «Öppna bordet». `server` is the page's HTTP origin, as `tableLinks` takes it.
export function startedWay(started: Started, answer: StartAnswer, server: string | null, lang?: Lang): { href: string; target: string } {
  if (answer.seating === 'computer' && started.hostSeat) {
    rememberHostSeat(started.id, { seat: started.hostSeat, name: answer.name })
    return { href: onlineUrl(started.id, server, started.hostSeat, true, lang, { code: started.code }), target: tableTab(started.id, 'online') }
  }
  return { href: tvUrl(started.id, server, started.hostKey, false, lang), target: tableTab(started.id, 'tv') }
}

// The tab is opened here, in the press, before anything is awaited: a browser lets a page open a
// window only in the hand's own gesture, and the table's address is not known until the start has
// answered. So the tab opens blank and is sent on. It keeps its opener (#1217): a tab opened
// without one is in a group of its own and never finds the editor's tab by name.
//
// `start` starts the table with the answer, and answers null when it did not (and has said why).
// What comes back says whether the tab could be opened: a browser that stops new windows leaves
// the page to offer the way as a link.
export async function startInTab(
  answer: StartAnswer,
  start: (seating: Seating) => Promise<Started | null>,
  server: string | null,
  lang?: Lang,
): Promise<{ started: Started; way: { href: string; target: string }; opened: boolean } | null> {
  rememberStart(answer)
  const tab = window.open('', '_blank')
  const started = await start(answer.seating)
  if (!started) {
    tab?.close()
    return null
  }
  const way = startedWay(started, answer, server, lang)
  if (!tab || tab.closed) return { started, way, opened: false }
  // Named for the table and its view now that the table is known, so the next way into the same
  // view brings this tab out (#1217). Whole, since a blank tab has no address of its own to read a
  // path against.
  tab.name = way.target
  tab.location.href = new URL(way.href, location.href).href
  return { started, way, opened: true }
}

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
    if (mine) return { href: onlineUrl(table.id, server, mine.seat, true, lang, table.code ? { code: table.code } : {}), target: tableTab(table.id, 'online') }
    if (table.code) return { href: roomPath(table.code, server), target: tableTab(table.id, 'online') }
  }
  return { href: tvUrl(table.id, server, undefined, true, lang), target: tableTab(table.id, 'tv') }
}

// The room's own address, `/KOD` (#675), with the development server as the table's WebSocket.
export const roomPath = (code: string, server: string | null): string => `/${code}${server ? `?${new URLSearchParams({ server: server.replace(/^http/, 'ws') }).toString()}` : ''}`

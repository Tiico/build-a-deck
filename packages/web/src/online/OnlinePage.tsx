import { useEffect, useMemo, useRef, useState } from 'react'
import type { Intent } from '@byd/protocol'
import '../table/table.css'
import '../player/player.css'
import './online.css'
import { TableRenderer, type TableHandle } from '../table/TableRenderer.js'
import { useTableClient } from '../table/useTableClient.js'
import { usePresence, useRecent } from '../table/usePresence.js'
import { previewOf } from '../table/rewind.js'
import { seatColor } from '../table/seatColor.js'
import { zoneAt } from '../zones.js'
import { CARD_MM } from '../table/drop.js'
import { playIntents } from '../player/play.js'
import { SessionButtons, SessionOverlays, useSessionVersion, useToast, refusedText } from '../player/SessionOverlays.js'
import { claimUrl } from '../account/api.js'
import { HandFan } from './HandFan.js'
import { HandSpread } from './HandSpread.js'
import { seatRotation, withoutHand } from './seat.js'
import { useFeltKeyboard } from '../table/useFeltKeyboard.js'
import { useActivityLive } from '../table/useActivityLive.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'

// /online?session=…&seat=A&name=Ada&server=ws://…
// Fully online (C2): both roles in one window. The table, turned so this seat's edge is at the
// bottom, playable as the table screen is; the seat's hand as a fan on the felt (prototype B);
// the phone's controls in the corner.
export type OnlinePageProps = { timing?: StatusTiming }

export function OnlinePage({ timing = DEFAULT_TIMING }: OnlinePageProps = {}) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const name = params.get('name')
  const token = params.get('token') ?? undefined
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  const conn = useTableClient(sessionId && seat ? { url, sessionId, seat, ...(token ? { token } : {}), ...(owner ? { owner: true } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, observers, refused } = conn
  // A whole table on a whole screen: the message stands on the felt, like the TV's.
  const live = useLiveStatus(conn, 'table', timing)
  const links = statusLinks({ server: params.get('server'), code: params.get('code') })
  usePageTitle({ state: sessionId && seat ? (refused ? 'forbidden' : live.state) : 'missing', room: params.get('code') ?? sessionId })
  const presence = usePresence(client, view)
  const recent = useRecent(activity)
  const table = useRef<TableHandle>(null)
  const [sheet, setSheet] = useState<'flag' | 'end' | null>(null)
  // The hand's second mode (#24): the fan at rest, the whole hand as a grid when it is asked for.
  const [spread, setSpread] = useState(false)
  const showAll = useRef<HTMLButtonElement>(null)
  const [toast, setToast] = useToast()
  const version = useSessionVersion(http, sessionId, view?.ended === true)
  // The felt and the fan, both as controls, both opening the same address panel (#1, #2).
  const kbd = useFeltKeyboard(view, view !== null && !view.rewind && !view.ended && client !== null, {
    act: (intents) => (client ? client.send(...intents) : Promise.resolve({ ok: false as const, reason: 'not connected' })),
    faces: http,
  })
  useActivityLive(activity, view, seat)

  const seatFree = view?.seats.find((s) => s.id === seat)?.name === null
  useEffect(() => {
    if (client && view && seat && name && seatFree) void client.send({ v: 'seat.claim', seat, name })
  }, [client, view === null, seat, name, seatFree])

  if (!sessionId || !seat) return <StatusNotice notice={noticeFor('missing', 'table')} surface="page" links={links} />
  // Not admitted, or kicked (DRIFT §9): a shut door rather than a broken line.
  if (refused) return <StatusNotice notice={{ ...noticeFor('forbidden', 'table'), text: refusedText(refused) }} surface="page" links={links} />
  if (!view || !client) return <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />

  const me = view.seats.find((s) => s.id === seat)
  const hand = view.components.filter((c) => c.zone === `hand:${seat}`)
  const shown = withoutHand(previewOf(view), seat)
  const playable = !view.rewind && !view.ended
  const up = spread && hand.length > 0
  const onAct = (intents: Intent[]) => void client.send(...intents)
  // A card out of the fan lands where it is dropped, centred on the pointer (K2, K11).
  const play = (card: (typeof hand)[number], clientX: number, clientY: number) => {
    const p = table.current?.toTable(clientX, clientY)
    if (!p || !playable) return
    const dest = zoneAt(view.zones, view.floor, p.x - CARD_MM.w / 2, p.y - CARD_MM.h / 2)
    if (dest.zone === `hand:${seat}`) return
    void client.send(...playIntents(view, [card], dest.zone, { x: dest.x, y: dest.y }))
  }

  return (
    <>
      <div data-page="online" data-status={status} className={`byd-fit byd-online${live.stale ? ' byd-status-stale' : ''}`} {...(live.stale ? { inert: true } : {})} style={{ ['--seat' as string]: seatColor(Math.max(0, view.seats.findIndex((s) => s.id === seat))) }}>
      {/* The seat's own line and the session's tools leave the bottom band altogether (#25):
          at 390 the band is 358 px, which holds eight forty-four pixel targets and no more, so
          the hand and the tools cannot both live there. C4's thumb pays for it; see C4's own
          revision of 2026-09-08. */}
      <div className="byd-online-top">
        <div className="byd-online-me">
          <strong>{me?.name ?? seat}</strong>
          <span>{hand.length} kort</span>
          {observers.length > 0 && <em>{observers.map((o) => o.name).join(', ')} tittar på</em>}
        </div>
        {hand.length > 0 && (
          <button type="button" className="byd-online-showall" ref={showAll} aria-expanded={spread ? 'true' : 'false'} onClick={() => setSpread(!spread)}>
            Visa alla
          </button>
        )}
        <div className="byd-online-tools">
          <SessionButtons client={client} view={view} onSheet={setSheet} />
        </div>
      </div>
      <div className="byd-online-play">
        <div className="byd-online-felt">
          <TableRenderer
            ref={table}
            view={shown}
            mode="table"
            rotate={seatRotation(view, seat)}
            faces={http}
            onAct={playable ? onAct : undefined}
            keyboard={kbd.keyboard}
            peers={Object.values(presence.peers)}
            pulses={presence.pulses}
            recent={recent}
            onPresence={(p) => client.sendPresence(p)}
          />
        </div>
        {/* One hand, one copy of it. While the grid stands the band is still drawn — dimmed,
            under it — but it is out of the tab order and out of the accessibility tree, the way
            the page behind any raised surface is. Two live copies of the same twenty-one
            controls would be two of every card to a screen reader (L10). */}
        <div className="byd-hand-under" {...(up ? { inert: true, 'aria-hidden': true } : {})}>
          <HandFan cards={hand} faces={http} onPlay={play} onOpen={(c) => kbd.openHand(c, [])} />
        </div>
        {up && (
          <HandSpread
            cards={hand}
            faces={http}
            onOpen={(c) => kbd.openHand(c, [])}
            onClose={() => {
              setSpread(false)
              showAll.current?.focus()
            }}
          />
        )}
      </div>
      {kbd.panel}
      <SessionOverlays client={client} view={view} seat={seat} name={me?.name ?? seat} http={http} sessionId={sessionId} sheet={sheet} onSheet={setSheet} toast={toast} onToast={setToast} version={version} saveUrl={token ? claimUrl(token, params.get('server')) : null} />
      </div>
      <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />
    </>
  )
}

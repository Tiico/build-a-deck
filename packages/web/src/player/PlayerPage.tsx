import { lazy, Suspense, useMemo } from 'react'
import { useTableClient } from '../table/useTableClient.js'
import { PlayerSurface, useHandMarks } from './PlayerSurface.js'
import { SeatSurvey, refusedText, useSessionVersion } from './SessionOverlays.js'
import { useSitDown } from './useSitDown.js'
import { claimUrl } from '../account/api.js'
import { useT } from '../i18n/index.js'
import './player.css'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks, wayBack } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useFeltKeyboard } from '../table/useFeltKeyboard.js'
import { useActivityLive } from '../table/useActivityLive.js'

const PlaytestPrototype = import.meta.env.DEV ? lazy(() => import('./prototype/PlayerPrototype.js')) : null

// /play?session=…&seat=A&name=Ada&token=…&server=ws://…
// The `player` role: one seat, its hand and private zones, and the zone shortcuts to play to.
// The token was bought with the room code on the join page (DRIFT §9).
// `onLeave` is where the way out (#31) sends the browser; a test hands it somewhere it can read.
export type PlayerPageProps = { timing?: StatusTiming; onLeave?(url: string): void }

export function PlayerPage({ timing = DEFAULT_TIMING, onLeave = (url) => location.assign(url) }: PlayerPageProps = {}) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const seat = params.get('seat')
  const name = params.get('name')
  const token = params.get('token') ?? undefined
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const conn = useTableClient(sessionId && seat ? { url, sessionId, seat, ...(token ? { token } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, refused } = conn
  const live = useLiveStatus(conn, 'phone', timing)
  const links = statusLinks({ server: params.get('server'), code: params.get('code') })
  usePageTitle({ state: sessionId && seat ? (refused ? 'forbidden' : live.state) : 'missing', room: params.get('code') ?? sessionId })
  const faces = url.replace(/^ws/, 'http')

  const marks = useHandMarks()
  const version = useSessionVersion(faces, sessionId, view?.ended === true)
  // The phone has no felt, so the keyboard here is the hand and the address panel it opens (#1).
  const kbd = useFeltKeyboard(view, false, {
    act: (intents) => (client ? client.send(...intents) : Promise.resolve({ ok: false as const, reason: 'not connected' })),
    onPlayed: marks.clear,
    faces,
  })
  useActivityLive(activity, view, seat)

  // Sit down on first contact, and only on first contact: claim the seat with the name from the
  // link, if it is still free.
  useSitDown(client, view, seat, name)

  if (!sessionId || !seat) return <StatusNotice notice={noticeFor('missing', 'phone', t)} surface="page" links={links} />
  // Not admitted, or kicked (DRIFT §9). The door is shut, so it is the `forbidden` state — said
  // in the model's form, with the server's own reason for the sentence.
  if (refused) return <StatusNotice notice={{ ...noticeFor('forbidden', 'phone', t), text: refusedText(refused, t) }} surface="page" links={links} />
  if (!view || !client) return <RouteStatus status={live} over="sheet" links={links} onRetry={conn.retry} />

  const me = view.seats.find((s) => s.id === seat)
  if (PlaytestPrototype && params.has('variant')) return <Suspense fallback={<p>Laddar prototyp…</p>}><PlaytestPrototype view={view} faces={faces} seat={seat} /></Suspense>

  return (
    <>
      {/* An ended table is one more state of D5's kind: the picture behind the survey is not to be
          acted on, so it is out of reach the same way a stale one is (UX-38, #83). */}
      <div className={`byd-player${live.stale ? ' byd-status-stale' : ''}`} data-page="player" data-status={status} {...(live.stale || view.ended ? { inert: true } : {})}>
        <PlayerSurface
          client={client}
          view={view}
          activity={activity}
          seat={seat}
          name={me?.name ?? seat}
          sessionId={sessionId}
          faces={faces}
          version={version}
          marks={marks}
          openHand={kbd.openHand}
          onLeft={() => onLeave(wayBack(links))}
        />
        {kbd.panel}
      </div>
      <SeatSurvey view={view} seat={seat} name={me?.name ?? seat} http={faces} sessionId={sessionId} version={version} saveUrl={token ? claimUrl(token, params.get('server')) : null} />
      <RouteStatus status={live} over="sheet" links={links} onRetry={conn.retry} />
    </>
  )
}

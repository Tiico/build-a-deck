import { useEffect, useMemo, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import '../table/table.css'
import '../player/player.css'
import { TableRenderer } from '../table/TableRenderer.js'
import { TvChrome } from '../table/TvChrome.js'
import { useTableClient } from '../table/useTableClient.js'
import { refusedText } from '../player/SessionOverlays.js'
import { FlagSheet } from '../player/SessionSheets.js'
import { Survey } from '../player/Survey.js'
import { submitSurvey } from '../player/surveyApi.js'
import { claimUrl } from '../account/api.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useRefusal } from '../status/Refusal.js'

// /observe?session=…&name=Eva&server=ws://…
// The observer (C8): sees every hand and every hidden pile, is announced to everyone, and can
// flag but never touch. After the session she answers the survey too, marked as an observer.
export type ObserverPageProps = { timing?: StatusTiming }

export function ObserverPage({ timing = DEFAULT_TIMING }: ObserverPageProps = {}) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const name = params.get('name') ?? 'observatör'
  const token = params.get('token') ?? undefined
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  const conn = useTableClient(sessionId ? { url, sessionId, seat: null, observer: name, ...(token ? { token } : {}), ...(owner ? { owner: true } : {}), connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, observers, refused } = conn
  const live = useLiveStatus(conn, 'table', timing)
  const links = statusLinks({ server: params.get('server'), code: params.get('code') })
  usePageTitle({ state: sessionId ? (refused ? 'forbidden' : live.state) : 'missing', room: params.get('code') ?? sessionId })
  const [sheet, setSheet] = useState(false)
  // Whether the column beside the table is called in (#6, prototype B). The observer watches, so
  // the table is the whole screen and everything else is summoned; on a desk there is room for
  // both at once and the drawer is simply the column it has always been.
  const [drawer, setDrawer] = useState(false)
  const flagged = useRefusal('table')
  const [inspecting, setInspecting] = useState<VisibleComponentState | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    if (!sessionId || !view?.ended || version) return
    void fetch(`${http}/sessions/${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ version: string }>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => setVersion(s.version))
      .catch(() => setVersion('?'))
  }, [sessionId, view?.ended, version, http])

  if (!sessionId) return <StatusNotice notice={noticeFor('missing', 'table')} surface="page" links={links} />
  // Not admitted, or kicked (DRIFT §9): a shut door rather than a broken line.
  if (refused) return <StatusNotice notice={{ ...noticeFor('forbidden', 'table'), text: refusedText(refused) }} surface="page" links={links} />
  if (!view || !client) return <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />

  return (
    <>
      <div data-page="observe" data-drawer={drawer ? 'open' : 'shut'} data-status={status} className={`byd-fit byd-observer${live.stale ? ' byd-status-stale' : ''}`} {...(live.stale ? { inert: true } : {})}>
      <TvChrome
        view={view}
        activity={activity}
        inspecting={inspecting}
        faces={http}
        observers={observers}
        note={<p className="byd-observer-note">Du är observatör: du ser allas händer och alla högar. Alla vet att du är här.</p>}
      >
        <TableRenderer view={view} mode="tv" faces={http} onInspect={setInspecting} />
      </TvChrome>
      {/* The handle (#6): a row of its own under the table, never a banner over it. What she is
          is always on it; the rest of the sentence, the feed and the seats are one press away and
          open under the table rather than across it. */}
      <div className="byd-observer-handle">
        <span className="byd-observer-mark">
          <i aria-hidden="true" />
          {name} tittar på
        </span>
        <button type="button" className="byd-observer-more" aria-expanded={drawer} onClick={() => setDrawer((open) => !open)}>
          Senast och platser
        </button>
        <button type="button" className="byd-observer-flag" disabled={view.ended} onClick={() => setSheet(true)}>
          ⚑ Flagga
        </button>
      </div>
      {toast && <div className="byd-toast">{toast}</div>}
      {sheet && (
        <FlagSheet
          refusal={flagged}
          onFlag={(note) => {
            void flagged.watch(client.send({ v: 'flag', ...(note ? { note } : {}) })).then((result) => {
              if (!result.ok) return
              setSheet(false)
              setToast('Ögonblicket är flaggat')
            })
          }}
          onClose={() => {
            flagged.clear()
            setSheet(false)
          }}
        />
      )}
      {view.ended && <Survey saveUrl={token ? claimUrl(token, params.get('server')) : null} who={name} version={version ?? '…'} onSubmit={(answers) => submitSurvey(http, sessionId, { who: name, seat: null, observer: true, answers })} />}
      </div>
      <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />
    </>
  )
}

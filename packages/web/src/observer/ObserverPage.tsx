import { useEffect, useMemo, useState } from 'react'
import type { VisibleComponentState } from '@byd/protocol'
import '../table/table.css'
import '../player/player.css'
import { TableRenderer } from '../table/TableRenderer.js'
import { TvChrome } from '../table/TvChrome.js'
import { useTableClient } from '../table/useTableClient.js'
import { FlagSheet } from '../player/SessionSheets.js'
import { Survey } from '../player/Survey.js'
import { submitSurvey } from '../player/surveyApi.js'
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
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  const conn = useTableClient(sessionId ? { url, sessionId, seat: null, observer: name, connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { client, view, status, activity, observers } = conn
  const live = useLiveStatus(conn, 'table', timing)
  const links = statusLinks({ server: params.get('server'), sessionId })
  usePageTitle({ state: sessionId ? live.state : 'missing', room: sessionId })
  const [sheet, setSheet] = useState(false)
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
  if (!view || !client) return <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />

  return (
    <>
      <div data-page="observe" data-status={status} className={`byd-fit${live.stale ? ' byd-status-stale' : ''}`} {...(live.stale ? { inert: true } : {})}>
      <TvChrome view={view} activity={activity} inspecting={inspecting} faces={http} observers={observers}>
        <TableRenderer view={view} mode="tv" faces={http} onInspect={setInspecting} />
      </TvChrome>
      <div className="byd-observer-banner">
        <span>Du är observatör: du ser allas händer och alla högar. Alla vet att du är här.</span>
        <button type="button" disabled={view.ended} onClick={() => setSheet(true)}>
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
      {view.ended && <Survey who={name} version={version ?? '…'} onSubmit={(answers) => submitSurvey(http, sessionId, { who: name, seat: null, observer: true, answers })} />}
      </div>
      <RouteStatus status={live} over="card" links={links} onRetry={conn.retry} />
    </>
  )
}

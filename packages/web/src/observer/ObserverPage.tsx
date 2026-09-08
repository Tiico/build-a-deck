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
import { useT } from '../i18n/index.js'

// /observe?session=…&name=Eva&server=ws://…
// The observer (C8): sees every hand and every hidden pile, is announced to everyone, and can
// flag but never touch. After the session she answers the survey too, marked as an observer.
export function ObserverPage() {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const name = params.get('name') ?? t('observer.name')
  const token = params.get('token') ?? undefined
  const owner = params.get('owner') === '1'
  const url = params.get('server') ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  const { client, view, status, activity, observers, refused } = useTableClient(sessionId ? { url, sessionId, seat: null, observer: name, ...(token ? { token } : {}), ...(owner ? { owner: true } : {}) } : null)
  const [sheet, setSheet] = useState(false)
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

  if (!sessionId) return <p>{t('play.session.missing')}</p>
  if (refused) return <p role="alert" data-refused={refused}>{refusedText(refused, t)}</p>
  if (!view || !client) return <p data-status={status}>{status === 'connecting' ? t('play.connecting') : status}</p>

  return (
    <div data-page="observe" data-status={status} className="byd-fit">
      <TvChrome view={view} activity={activity} inspecting={inspecting} faces={http} observers={observers}>
        <TableRenderer view={view} mode="tv" faces={http} onInspect={setInspecting} />
      </TvChrome>
      <div className="byd-observer-banner">
        <span>{t('observer.banner')}</span>
        <button type="button" disabled={view.ended} onClick={() => setSheet(true)}>
          {t('session.flag')}
        </button>
      </div>
      {toast && <div className="byd-toast">{toast}</div>}
      {sheet && (
        <FlagSheet
          onFlag={(note) => {
            void client.send({ v: 'flag', ...(note ? { note } : {}) })
            setSheet(false)
            setToast(t('session.flagged'))
          }}
          onClose={() => setSheet(false)}
        />
      )}
      {view.ended && <Survey saveUrl={token ? claimUrl(token, params.get('server')) : null} who={name} version={version ?? '…'} onSubmit={(answers) => submitSurvey(http, sessionId, { who: name, seat: null, observer: true, answers })} />}
    </div>
  )
}

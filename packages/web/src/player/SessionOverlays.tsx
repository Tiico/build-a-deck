import { useEffect, useState } from 'react'
import type { Snapshot } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { whoDecides } from '../table/rewind.js'
import { FlagSheet, EndSheet } from './SessionSheets.js'
import { Survey } from './Survey.js'
import { submitSurvey } from './surveyApi.js'
import { useRefusal } from '../status/Refusal.js'
import { useT, type T } from '../i18n/index.js'

// Why the server would not have us (DRIFT §9), in words for the screen.
export function refusedText(reason: string, t: T): string {
  return t(reason === 'kicked' ? 'session.refused.kicked' : 'session.refused.gone')
}

// What a seat's screen carries beside the hand, on the phone and online alike (C2): the toast,
// the flag and end sheets, the rewind proposal, and the survey once the log is locked.

// The version the session runs on, from the session record; the survey and the end sheet say it.
export function useSessionVersion(http: string, sessionId: string | null, when: boolean): string | null {
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => {
    if (!sessionId || !when || version) return
    void fetch(`${http}/sessions/${encodeURIComponent(sessionId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ version: string }>) : Promise.reject(new Error(String(r.status)))))
      .then((s) => setVersion(s.version))
      .catch(() => setVersion('?'))
  }, [http, sessionId, when, version])
  return version
}

export function useToast(): [string | null, (msg: string) => void] {
  const [toast, setToast] = useState<string | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(timer)
  }, [toast])
  return [toast, setToast]
}

export type SessionOverlaysProps = {
  client: TableClient
  view: Snapshot
  seat: string
  name: string
  http: string
  sessionId: string
  sheet: 'flag' | 'end' | null
  onSheet(sheet: 'flag' | 'end' | null): void
  toast: string | null
  onToast(msg: string): void
  version: string | null
  // Where to save the session to an account afterwards (G1); absent without a guest token.
  saveUrl?: string | null | undefined
}

export function SessionOverlays({ client, view, seat, name, http, sessionId, sheet, onSheet, toast, onToast, version, saveUrl }: SessionOverlaysProps) {
  const t = useT()
  const proposal = view.rewind
  // A sheet that sends something can be answered no, and the answer stands beside the button
  // that was pressed rather than in a toast that says the opposite of what happened (#7).
  const flagged = useRefusal('phone')
  const ended = useRefusal('phone')
  const settle = (v: 'rewind.confirm' | 'rewind.reject') => {
    if (proposal) void client.send({ v, proposal: proposal.id })
  }
  return (
    <>
      {toast && <div className="byd-toast" role="status">{toast}</div>}
      {sheet === 'flag' && (
        <FlagSheet
          refusal={flagged}
          onFlag={(note) => {
            void flagged.watch(client.send({ v: 'flag', ...(note ? { note } : {}) })).then((result) => {
              if (!result.ok) return
              onSheet(null)
              onToast(t('session.flagged'))
            })
          }}
          onClose={() => {
            flagged.clear()
            onSheet(null)
          }}
        />
      )}
      {sheet === 'end' && (
        <EndSheet
          version={version ?? t('session.version.this')}
          refusal={ended}
          onEnd={() => {
            void ended.watch(client.send({ v: 'session.end' })).then((result) => result.ok && onSheet(null))
          }}
          onClose={() => {
            ended.clear()
            onSheet(null)
          }}
        />
      )}
      {view.ended && <Survey who={name} version={version ?? '…'} saveUrl={saveUrl} onSubmit={(answers) => submitSurvey(http, sessionId, { who: name, seat, answers })} />}
      {proposal && proposal.by === seat && (
        <div className="byd-rewind-mine" data-rewind-mine>
          <span>{t('rewind.mine', { who: whoDecides(view, proposal, t) })}</span>
          <button onClick={() => settle('rewind.reject')}>{t('rewind.withdraw')}</button>
        </div>
      )}
      {proposal && proposal.by !== seat && (
        <div className="byd-rewind-ask" data-rewind-ask>
          <h1>{t('rewind.ask.title', { who: view.seats.find((s) => s.id === proposal.by)?.name ?? t('play.table') })}</h1>
          <p>{t('rewind.ask.body')}</p>
          <button data-kind="ok" onClick={() => settle('rewind.confirm')}>
            {t('rewind.approve')}
          </button>
          <button data-kind="no" onClick={() => settle('rewind.reject')}>
            {t('rewind.decline')}
          </button>
        </div>
      )}
    </>
  )
}

// The three buttons every seat has: undo (B, C), flag (G3), end (C9).
export function SessionButtons({ client, view, onSheet }: { client: TableClient; view: Snapshot; onSheet(sheet: 'flag' | 'end'): void }) {
  const t = useT()
  const tapUndo = () => {
    if (!view.undo) return
    void client.send(view.undo.contested ? { v: 'rewind.propose', toSeq: view.undo.toSeq } : { v: 'undo.self' })
  }
  return (
    <>
      <button className="byd-undo" disabled={!view.undo || !!view.rewind || view.ended} onClick={tapUndo}>
        {t('session.undo')}
      </button>
      <button className="byd-flag" disabled={view.ended} onClick={() => onSheet('flag')}>
        {t('session.flag')}
      </button>
      <button className="byd-end" disabled={view.ended} onClick={() => onSheet('end')}>
        {t('session.end')}
      </button>
    </>
  )
}

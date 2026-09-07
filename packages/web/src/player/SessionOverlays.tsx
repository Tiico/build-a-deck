import { useEffect, useState } from 'react'
import type { Snapshot } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { whoDecides } from '../table/rewind.js'
import { FlagSheet, EndSheet } from './SessionSheets.js'
import { Survey } from './Survey.js'
import { submitSurvey } from './surveyApi.js'

// Why the server would not have us (DRIFT §9), in words for the screen.
export function refusedText(reason: string): string {
  if (reason === 'kicked') return 'Värden har tagit bort dig från bordet.'
  return 'Länken gäller inte längre. Gå med igen med rumskoden.'
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
  const proposal = view.rewind
  const settle = (v: 'rewind.confirm' | 'rewind.reject') => {
    if (proposal) void client.send({ v, proposal: proposal.id })
  }
  return (
    <>
      {toast && <div className="byd-toast" role="status">{toast}</div>}
      {sheet === 'flag' && (
        <FlagSheet
          onFlag={(note) => {
            void client.send({ v: 'flag', ...(note ? { note } : {}) })
            onSheet(null)
            onToast('Ögonblicket är flaggat')
          }}
          onClose={() => onSheet(null)}
        />
      )}
      {sheet === 'end' && (
        <EndSheet
          version={version ?? 'den här versionen'}
          onEnd={() => {
            void client.send({ v: 'session.end' })
            onSheet(null)
          }}
          onClose={() => onSheet(null)}
        />
      )}
      {view.ended && <Survey who={name} version={version ?? '…'} saveUrl={saveUrl} onSubmit={(answers) => submitSurvey(http, sessionId, { who: name, seat, answers })} />}
      {proposal && proposal.by === seat && (
        <div className="byd-rewind-mine" data-rewind-mine>
          <span>Du föreslår att spola tillbaka. Bordet visar hur det såg ut; {whoDecides(view, proposal)} avgör.</span>
          <button onClick={() => settle('rewind.reject')}>Dra tillbaka förslaget</button>
        </div>
      )}
      {proposal && proposal.by !== seat && (
        <div className="byd-rewind-ask" data-rewind-ask>
          <h1>{view.seats.find((s) => s.id === proposal.by)?.name ?? 'Bordet'} vill spola tillbaka</h1>
          <p>Bordet visar hur det såg ut. Draghögen blandas om.</p>
          <button data-kind="ok" onClick={() => settle('rewind.confirm')}>
            Godkänn
          </button>
          <button data-kind="no" onClick={() => settle('rewind.reject')}>
            Neka
          </button>
        </div>
      )}
    </>
  )
}

// The three buttons every seat has: undo (B, C), flag (G3), end (C9).
export function SessionButtons({ client, view, onSheet }: { client: TableClient; view: Snapshot; onSheet(sheet: 'flag' | 'end'): void }) {
  const tapUndo = () => {
    if (!view.undo) return
    void client.send(view.undo.contested ? { v: 'rewind.propose', toSeq: view.undo.toSeq } : { v: 'undo.self' })
  }
  return (
    <>
      <button className="byd-undo" disabled={!view.undo || !!view.rewind || view.ended} onClick={tapUndo}>
        ↶ Ångra
      </button>
      <button className="byd-flag" disabled={view.ended} onClick={() => onSheet('flag')}>
        ⚑ Flagga
      </button>
      <button className="byd-end" disabled={view.ended} onClick={() => onSheet('end')}>
        Avsluta
      </button>
    </>
  )
}

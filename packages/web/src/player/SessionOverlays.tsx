import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { whoDecides } from '../table/rewind.js'
import { FlagSheet, EndSheet, ExitSheet } from './SessionSheets.js'
import { Survey } from './Survey.js'
import { submitSurvey } from './surveyApi.js'
import { useRefusal } from '../status/Refusal.js'
import { useT, type T } from '../i18n/index.js'

// Why the server would not have us (DRIFT §9), in words for the screen.
export function refusedText(reason: string, t: T): string {
  return t(reason === 'kicked' ? 'session.refused.kicked' : 'session.refused.gone')
}

// What a seat's screen carries beside the hand, on the phone and online alike (C2): the toast,
// the flag, exit and end sheets, the rewind proposal, and the survey once the log is locked.

// Which sheet the seat's screen has raised. `exit` is the way out asking which way out (#31); it
// is the only one that opens another, and the one it opens is `end`, unchanged.
export type Sheet = 'flag' | 'exit' | 'end' | null

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
  sheet: Sheet
  onSheet(sheet: Sheet): void
  // Where the way out leads once the seat has been given up (#31): the seat picker, with the
  // acknowledgement of what happened to the seat and the hand.
  onLeft(): void
  toast: string | null
  onToast(msg: string): void
  version: string | null
  // Where to save the session to an account afterwards (G1); absent without a guest token.
  saveUrl?: string | null | undefined
}

export function SessionOverlays({ client, view, seat, name, http, sessionId, sheet, onSheet, onLeft, toast, onToast, version, saveUrl }: SessionOverlaysProps) {
  const t = useT()
  const proposal = view.rewind
  // A sheet that sends something can be answered no, and the answer stands beside the button
  // that was pressed rather than in a toast that says the opposite of what happened (#7).
  const flagged = useRefusal('phone')
  const ended = useRefusal('phone')
  const gone = useRefusal('phone')
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
      {sheet === 'exit' && (
        <ExitSheet
          refusal={gone}
          onLeave={() => {
            void gone.watch(client.send({ v: 'seat.release', seat })).then((result) => {
              if (!result.ok) return
              onSheet(null)
              onLeft()
            })
          }}
          onEnd={() => {
            gone.clear()
            onSheet('end')
          }}
          onClose={() => {
            gone.clear()
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

// The three buttons every seat has, and three is the number (#31): the row is full at 375 px,
// and a game with a rulebook puts a fourth control of its own beside them. Undo (B, C), flag
// (G3), and the way out (C9, #31) — which is one control for both exits rather than two exits
// standing next to each other.
//
// The way out is short on the screen and whole in the ear. The three words on the button are
// what fits beside the other two at 375 px; a name has no width to run out of, so the one a
// reader hears says which way out it is — beginning with the label itself, because WCAG 2.5.3
// wants the visible text inside the spoken name (#48). The sheet behind it is already called
// something plain, so the button only has to say where it leads, not what it will ask.
//
// Whichever of them opened a sheet takes the focus back when the last sheet closes, wherever the
// chain went — `Question.tsx`'s manners, which say a question hands the focus back to what opened
// it. The row is what opened it, so the row is where it is handed back.
export function SessionButtons({ client, view, sheet, onSheet }: { client: TableClient; view: Snapshot; sheet: Sheet; onSheet(sheet: Sheet): void }) {
  const t = useT()
  const opener = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (sheet !== null) return
    const from = opener.current
    opener.current = null
    if (from?.isConnected && !from.disabled) from.focus()
  }, [sheet])
  const raise = (which: Sheet) => (event: { currentTarget: HTMLButtonElement }) => {
    opener.current = event.currentTarget
    onSheet(which)
  }
  const tapUndo = () => {
    if (!view.undo) return
    void client.send(view.undo.contested ? { v: 'rewind.propose', toSeq: view.undo.toSeq } : { v: 'undo.self' })
  }
  return (
    <>
      <button className="byd-undo" disabled={!view.undo || !!view.rewind || view.ended} onClick={tapUndo}>
        {t('session.undo')}
      </button>
      <button className="byd-flag" disabled={view.ended} onClick={raise('flag')}>
        {t('session.flag')}
      </button>
      <button className="byd-exit" aria-label={t('session.exit.aria', { label: t('session.exit') })} disabled={view.ended} onClick={raise('exit')}>
        {t('session.exit')}
      </button>
    </>
  )
}

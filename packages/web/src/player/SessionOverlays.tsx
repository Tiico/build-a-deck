import { useEffect, useId, useRef, useState } from 'react'
import { useFocusTrap } from '../editor/focusTrap.js'
import type { Snapshot } from '@byd/protocol'
import type { TableClient } from '../client.js'
import { standingRewind, whereTo, whoDecides } from '../table/rewind.js'
import { FlagSheet, EndSheet, ExitSheet } from './SessionSheets.js'
import { Survey } from './Survey.js'
import { submitSurvey } from './surveyApi.js'
import { useHasRulebook } from '../rules/sessionRules.js'
import { useRefusal } from '../status/Refusal.js'
import { useT, type T } from '../i18n/index.js'
import { returnPile } from '../table/handName.js'
import { FlagGlyph, HookGlyph } from '../glyphs.js'

// Why the server would not have us (DRIFT §9), in words for the screen.
export function refusedText(reason: string, t: T): string {
  return t(reason === 'kicked' ? 'session.refused.kicked' : 'session.refused.gone')
}

// What a seat's screen carries beside the hand, on the phone and online alike (C2): the toast,
// the flag, exit and end sheets, and the rewind proposal. The survey once the log is locked is
// `SeatSurvey`, mounted beside the play view rather than inside it, because the play view is
// inert by then (UX-38) and the survey is the one thing that is not.

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
  sheet: Sheet
  onSheet(sheet: Sheet): void
  // Where the way out leads once the seat has been given up (#31): the seat picker, with the
  // acknowledgement of what happened to the seat and the hand.
  onLeft(): void
  toast: string | null
  onToast(msg: string): void
  version: string | null
}

export function SessionOverlays({ client, view, seat, sheet, onSheet, onLeft, toast, onToast, version }: SessionOverlaysProps) {
  const t = useT()
  const proposal = standingRewind(view)
  // A sheet that sends something can be answered no, and the answer stands beside the button
  // that was pressed rather than in a toast that says the opposite of what happened (#7).
  const flagged = useRefusal('phone')
  const ended = useRefusal('phone')
  const gone = useRefusal('phone')
  const settle = (v: 'rewind.confirm' | 'rewind.reject') => {
    if (proposal) void client.send({ v, proposal: proposal.id })
  }
  // The answer to this seat's own proposal, when it is no (#483): the strip under the proposer just
  // went away, which read the same as a proposal still being thought about. Read off the log line
  // that settled it, so a proposal the proposer withdrew herself is not reported back to her.
  const mine = useRef<string | null>(null)
  useEffect(() => {
    if (proposal && proposal.by === seat) {
      mine.current = proposal.id
      return
    }
    const was = mine.current
    if (was === null || proposal?.id === was) return
    mine.current = null
    const said = [...client.activity].reverse().find((l) => l.intent.v === 'rewind.reject' && 'proposal' in l.intent && l.intent.proposal === was)
    if (said && said.by !== seat) onToast(t('rewind.declined', { who: view.seats.find((s) => s.id === said.by)?.name ?? t('rewind.someone') }))
  })
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
          pile={returnPile(view, seat)}
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
      {proposal && proposal.by === seat && (
        <div className="byd-rewind-mine" data-rewind-mine>
          <span>{t('rewind.mine', { who: whoDecides(view, proposal, t) })}</span>
          <button onClick={() => settle('rewind.reject')}>{t('rewind.withdraw')}</button>
        </div>
      )}
      {proposal && proposal.by !== seat && (
        <RewindAsk who={view.seats.find((s) => s.id === proposal.by)?.name ?? t('play.table')} where={whereTo(view, proposal, client.activity, t)} pile={returnPile(view, view.seat)} onSettle={settle} />
      )}
    </>
  )
}

// The survey after the session (G3), for a seat: the phone and the online seat mount it as a
// sibling of the play view, outside the `inert` an ended table puts on that view (UX-38, #83).
export type SeatSurveyProps = {
  view: Snapshot
  seat: string
  name: string
  http: string
  sessionId: string
  version: string | null
  // Where to save the session to an account afterwards (G1); absent without a guest token.
  saveUrl?: string | null | undefined
}

export function SeatSurvey({ view, seat, name, http, sessionId, version, saveUrl }: SeatSurveyProps) {
  const rulebook = useHasRulebook(http, sessionId, view.ended)
  if (!view.ended) return null
  return <Survey who={name} version={version ?? '…'} saveUrl={saveUrl} remember={`${sessionId}:${seat}`} rulebook={rulebook} onSubmit={(answers) => submitSurvey(http, sessionId, { who: name, seat, answers })} />
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
  // «Ångra» switches itself off by being pressed: the one thing there was to undo is undone. A
  // `disabled` button cannot hold the focus, so the focus that pressed it fell to nothing and the
  // next Tab began again at the top (#761, K16). It is `aria-disabled` instead, as the strip's
  // «Flytta vänster» is at the end of the hand (L53): said to be off, kept in the tab order, and
  // doing nothing when pressed.
  const off = !view.undo || !!view.rewind || view.ended
  const tapUndo = () => {
    if (off || !view.undo) return
    void client.send(view.undo.contested ? { v: 'rewind.propose', toSeq: view.undo.toSeq } : { v: 'undo.self' })
  }
  return (
    <>
      <button className="byd-undo" aria-disabled={off} onClick={tapUndo}>
        <HookGlyph />
        {t('session.undo')}
      </button>
      <button className="byd-flag" disabled={view.ended} onClick={raise('flag')}>
        <FlagGlyph />
        {t('session.flag')}
      </button>
      <button className="byd-exit" aria-label={t('session.exit.aria', { label: t('session.exit') })} disabled={view.ended} onClick={raise('exit')}>
        {t('session.exit')}
      </button>
    </>
  )
}

// Another seat's rewind, asked of this one (K13, #483): a dialog over the whole phone that takes the
// focus and holds it, on the answer that changes nothing, until it is answered.
// `where` is the move the table would go back to before, said as the TV's frame says it (#714).
function RewindAsk({ who, where, pile, onSettle }: { who: string; where: string; pile: string | null; onSettle(v: 'rewind.confirm' | 'rewind.reject'): void }) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const no = useRef<HTMLButtonElement>(null)
  useFocusTrap(box, { initial: () => no.current })
  return (
    <div className="byd-rewind-ask" data-rewind-ask ref={box} role="alertdialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}>
      <h1 id={`${id}-title`}>{t('rewind.ask.title', { who })}</h1>
      <p id={`${id}-body`}>{pile ? t('rewind.ask.body', { pile, where }) : t('rewind.ask.body.any', { where })}</p>
      <button data-kind="ok" className="byd-primary" onClick={() => onSettle('rewind.confirm')}>
        {t('rewind.approve')}
      </button>
      <button data-kind="no" ref={no} onClick={() => onSettle('rewind.reject')}>
        {t('rewind.decline')}
      </button>
    </div>
  )
}

import { useEffect, useRef, type CSSProperties } from 'react'
import type { Intent, Snapshot } from '@byd/protocol'
import { compileStart, startsAt } from './actions.js'
import { useT, type Key } from '../i18n/index.js'

// «Starta spelet» (K25), as one control wherever it is drawn: the felt's tile, and the waiting
// room that lies over the felt on /online (L75, #1130). There is one start, not two that agree —
// the same envelope, the same wait for the cards (#765), the same «Starta ändå» when the queue
// stands still (#88), and the same reason, in the ring's own words, when it cannot run (K21).

export type StartWait = { done: number; total: number; stalled: boolean } | null

// Why the start cannot run, in the ring's own words: it is the same machine answering, so it is
// the same sentence. A step that asks for a number has nobody to ask the moment the game is to
// begin, and says so rather than guess one.
export const whyKey = (made: { ok: false; why: string } | { ok: false; asks: string } | { ok: true }): Key =>
  ('why' in made ? `ring.action.why.${made.why}` : 'ring.action.why.asks') as Key

// The start this table has, or null when no pile carries a start action (K25: a felt where no
// pile has one draws no tile at all).
export function startOf(view: Snapshot): ReturnType<typeof compileStart> | null {
  return startsAt(view).length > 0 ? compileStart(view) : null
}

// «Starta spelet» gives way to «Starta om» in the corner once the start has run, and the control
// that was pressed is gone from under the focus (#761, K16: the first stop that is left, never
// nothing). The focus is carried to the tile that took its place, the same control by another
// name. `mark` says whether the press came with the focus on it.
export function useStartFocus(played: boolean): (hadFocus: boolean) => void {
  const had = useRef(false)
  useEffect(() => {
    if (!played || !had.current) return
    had.current = false
    const at = document.activeElement
    if (at === null || at === document.body) document.querySelector<HTMLElement>('.byd-table-restart')?.focus()
  }, [played])
  return (hadFocus) => {
    had.current = hadFocus
  }
}

type Props = {
  view: Snapshot
  startWait: StartWait
  // The press, once the start can run: the envelope, and whether the focus was on the button.
  onStart(intents: Intent[], hadFocus: boolean): void
  className: string
  style?: CSSProperties
}

export function StartButton({ view, startWait, onStart, className, style }: Props) {
  const t = useT()
  const start = startOf(view)
  if (!start) return null
  const waiting = startWait !== null && !startWait.stalled
  return (
    <button
      type="button"
      className={className}
      data-table-start={!start.ok ? 'why' : startWait === null ? 'ready' : startWait.stalled ? 'anyway' : 'wait'}
      disabled={!start.ok || waiting}
      title={!start.ok ? t('start.blocked', { why: t(whyKey(start)) }) : waiting ? t('start.blocked', { why: t('start.wait.why') }) : undefined}
      style={style}
      onClick={(e) => {
        if (!start.ok || waiting) return
        onStart(start.intents, e.currentTarget === document.activeElement)
      }}
    >
      {startWait === null ? (
        t('start.tile')
      ) : (
        <>
          {t(startWait.stalled ? 'start.anyway' : 'start.tile')}
          <small>{t(startWait.stalled ? 'start.stalled' : 'start.wait', { done: startWait.done, total: startWait.total })}</small>
        </>
      )}
    </button>
  )
}

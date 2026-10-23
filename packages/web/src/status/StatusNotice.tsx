import { useLayoutEffect, useRef } from 'react'
import { blocksView, type ActionKind, type Notice } from './notice.js'
import { useT } from '../i18n/index.js'
import { useAnnounce } from './StatusLive.js'
import './status.css'

// Where the message stands. The model is shared; the form is the route's own (variant C):
// a whole page when there is nothing behind worth protecting, a card mid-felt a room can read
// across a table, a sheet under the thumb on a phone, a bar in the editor's chrome.
export type Surface = 'page' | 'card' | 'sheet' | 'bar'

// Where each way out leads. A kind with no destination is not offered, so a route never shows a
// button that goes nowhere.
export type StatusLinks = Partial<Record<ActionKind, string>>

// What the transport is doing while nobody presses anything: which attempt is coming and when.
export type Countdown = { seconds: number; attempt: number; attempts: number | null }

// Which of the room's two shared screens the message stands on, if either (#925, K26): the TV is read
// from a sofa three metres away and table mode from the other side of the table, so the page form
// is drawn there in the room's sizes and not the desk's. Every other route leaves it out.
export type RoomScreen = 'tv' | 'table'

export type StatusNoticeProps = {
  notice: Notice
  surface: Surface
  links?: StatusLinks
  onRetry?: () => void
  // Signing out so another account can sign in (#748): a button, because it changes something.
  onSwitch?: () => void
  countdown?: Countdown | null
  // The clock the data behind this message was last true at, so that "old" is a fact and not a
  // feeling (#7).
  asOf?: string | null
  room?: RoomScreen
}

export function StatusNotice({ notice, surface, links = {}, onRetry, onSwitch, countdown = null, asOf = null, room }: StatusNoticeProps) {
  const t = useT()
  // A message that replaces the view takes the focus with it. Without that a keyboard reader is
  // left standing in a document that no longer holds what she was reading.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const takesFocus = surface === 'page' && blocksView(notice.state)
  // The focus reads the heading it lands on, so the live region says only the rest (#555): both
  // said the heading, and it was read twice.
  useAnnounce(takesFocus ? { ...notice, heading: '' } : notice)
  // Every move of the focus is made in the commit that takes away what had it (#1244). From an
  // effect it was a commit late, and in between the focus stood on <body>: a screen reader reads
  // that as the page starting over, and the next Tab starts from the top.
  useLayoutEffect(() => {
    if (takesFocus) headingRef.current?.focus()
  }, [takesFocus, notice.state])
  // «Försök igen» takes its own button away (#485): the next state is a wait with nothing to press,
  // and once the line is back the message goes too. The focus goes with neither: it stays on the
  // message while the message stands, and is handed to the view it lay over when it is gone.
  const retried = useRef(false)
  const section = useRef<HTMLElement>(null)
  const lost = () => document.activeElement === null || document.activeElement === document.body
  useLayoutEffect(() => {
    if (retried.current && lost()) headingRef.current?.focus()
  }, [notice.state])
  useLayoutEffect(() => {
    const message = section.current
    return () => {
      // The message is still in the document while this runs, so the focus it holds is still in
      // it: that is the focus about to be lost.
      if (!retried.current || !(lost() || message?.contains(document.activeElement))) return
      const view = document.querySelector<HTMLElement>('[data-page]')
      if (!view) return
      if (!view.hasAttribute('tabindex')) view.tabIndex = -1
      view.focus({ preventScroll: true })
    }
  }, [])

  const waiting = notice.state === 'loading' || notice.state === 'connecting' || notice.state === 'slow'
  const Heading = surface === 'page' ? 'h1' : 'h2'
  const actions = notice.actions.filter((a) => a.kind === 'retry' || (a.kind === 'switch' ? onSwitch !== undefined : links[a.kind] !== undefined))
  return (
    // The room's sizes are a page's alone, so only a page says which room it stands in: the sheet
    // can then ask for `[data-room-screen]` without `[data-surface='page']` at every rule, bytes the
    // first frame's blocking sheet has no room for (felt-font.spec.ts).
    <section ref={section} className="byd-status" data-status-notice={notice.state} data-surface={surface} data-tone={notice.tone} {...(room && surface === 'page' ? { 'data-room-screen': room } : {})}>
      <span className="byd-status-mark">{notice.mark}</span>
      <Heading ref={headingRef} tabIndex={-1}>
        {waiting && <span className="byd-status-spin" aria-hidden="true" />}
        {notice.heading}
      </Heading>
      {notice.text !== '' && <p>{notice.text}</p>}
      {asOf !== null && (
        <p className="byd-status-as-of">{t('status.asOf', { at: asOf })}</p>
      )}
      {countdown && (
        <p className="byd-status-countdown">
          <span className="byd-status-spin" aria-hidden="true" />
          {countdown.attempts === null ? t('status.countdown.ongoing', { seconds: countdown.seconds }) : t('status.countdown', { seconds: countdown.seconds, attempt: countdown.attempt, attempts: countdown.attempts })}
        </p>
      )}
      {actions.length > 0 && (
        <div className="byd-status-acts">
          {actions.map((action) =>
            action.kind === 'retry' ? (
              <button
                key={action.kind}
                type="button"
                className="byd-status-act"
                onClick={() => {
                  retried.current = true
                  onRetry?.()
                }}
                {...(action.primary === true ? { 'data-primary': '' } : {})}
              >
                {action.label}
              </button>
            ) : action.kind === 'switch' ? (
              <button key={action.kind} type="button" className="byd-status-act" onClick={onSwitch} {...(action.primary === true ? { 'data-primary': '' } : {})}>
                {action.label}
              </button>
            ) : (
              <a key={action.kind} className="byd-status-act" href={links[action.kind]} {...(action.primary === true ? { 'data-primary': '' } : {})}>
                {action.label}
              </a>
            ),
          )}
        </div>
      )}
    </section>
  )
}

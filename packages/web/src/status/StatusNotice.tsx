import { useEffect, useRef } from 'react'
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
export type Countdown = { seconds: number; attempt: number; attempts: number }

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
}

export function StatusNotice({ notice, surface, links = {}, onRetry, onSwitch, countdown = null, asOf = null }: StatusNoticeProps) {
  const t = useT()
  // A message that replaces the view takes the focus with it. Without that a keyboard reader is
  // left standing in a document that no longer holds what she was reading.
  const headingRef = useRef<HTMLHeadingElement>(null)
  const takesFocus = surface === 'page' && blocksView(notice.state)
  // The focus reads the heading it lands on, so the live region says only the rest (#555): both
  // said the heading, and it was read twice.
  useAnnounce(takesFocus ? { ...notice, heading: '' } : notice)
  useEffect(() => {
    if (takesFocus) headingRef.current?.focus()
  }, [takesFocus, notice.state])
  // «Försök igen» takes its own button away (#485): the next state is a wait with nothing to press,
  // and once the line is back the message goes too. The focus goes with neither: it stays on the
  // message while the message stands, and is handed to the view it lay over when it is gone.
  const retried = useRef(false)
  const lost = () => document.activeElement === null || document.activeElement === document.body
  useEffect(() => {
    if (retried.current && lost()) headingRef.current?.focus()
  }, [notice.state])
  useEffect(
    () => () => {
      if (!retried.current || !lost()) return
      const view = document.querySelector<HTMLElement>('[data-page]')
      if (!view) return
      if (!view.hasAttribute('tabindex')) view.tabIndex = -1
      view.focus({ preventScroll: true })
    },
    [],
  )

  const waiting = notice.state === 'loading' || notice.state === 'connecting' || notice.state === 'slow'
  const Heading = surface === 'page' ? 'h1' : 'h2'
  const actions = notice.actions.filter((a) => a.kind === 'retry' || (a.kind === 'switch' ? onSwitch !== undefined : links[a.kind] !== undefined))
  return (
    <section className="byd-status" data-status-notice={notice.state} data-surface={surface} data-tone={notice.tone}>
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
          {t('status.countdown', { seconds: countdown.seconds, attempt: countdown.attempt, attempts: countdown.attempts })}
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

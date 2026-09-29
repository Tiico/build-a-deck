import { useLayoutEffect, useRef, type ReactNode } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import { describeActivity, sayable } from './describe.js'
import { seatColor } from './seatColor.js'
import { QrCode } from './QrCode.js'
import { Texture } from './Texture.js'
import { hue } from './hue.js'
import { cardWord } from './keyboard.js'
import { SHOW_MS, componentOf } from './presence.js'
import { Help } from '../editor/HelpDrawer.js'
import { useT } from '../i18n/index.js'
import { useSmallestPt } from './smallest.js'
import { readingWidth } from '../legibility.js'
import { CARD_STANDARD_63x88 } from '@byd/engine'

// From how many seats a seat stands on one line in the column (#482 fynd 6).
const DENSE_SEATS = 7

export type TvChromeProps = {
  view: Snapshot
  activity: readonly Activity[]
  // The short code phones join by (K12). Without one there is nothing to type in, and a screen
  // that is not joined from — the observer's — says nothing rather than spelling out an id.
  roomCode?: string | undefined
  joinUrl?: string | undefined
  // The game this table runs, and which version of it (B4): the screen's title.
  title?: string | undefined
  version?: string | undefined
  // The card the screen is pointed at (C, K8): shown large beside the table for everyone in the
  // room, since a TV has no one holding it. It overrides what the panel would hold on its own;
  // null is not "nothing to show" but "nobody is pointing". `faces` is where the texture is from.
  inspecting?: VisibleComponentState | null | undefined
  faces?: string | undefined
  // A card somebody holds up for the room (K8, #508): drawn over the felt at a size the sofa can
  // read (K26), with who is showing it — a seat's name, or null for the table's own keyboard. The
  // caller has already checked that this screen sees the card's face (`shownCard`).
  showing?: { card: VisibleComponentState; by: string | null; at: number } | null | undefined
  onDismiss?: (() => void) | undefined
  // Who is watching (C8): observers are never invisible.
  observers?: readonly { id: string; name: string }[] | undefined
  // A line the surrounding screen wants said beside the table rather than over it — the
  // observer's own sentence about what she is (#6). It stands at the top of the column the table
  // talks in, so it is read where the table is read and covers nothing.
  note?: ReactNode
  // The rulebook, one press away on the same screen (B7). It stands in the header beside the way
  // in rather than over it: both wanted the top right corner, and only the header can lay both
  // out (#30).
  rules?: ReactNode
  children: ReactNode
}

// TV mode (C5, prototype C): the table, and a column beside it with the room code to join by, the
// card the screen is pointed at, every seat, and what just happened in words — all legible from
// across a room.
//
// Everything stands in that one column, and that is the whole of the layout's argument. The felt
// is bound by its height and never by its width: 800 mm of felt into the frame a TV leaves it is
// what sets the scale, so the column beside it costs the felt nothing, while a header above it
// and a seat dock below it cost it everything they take. This chrome used to lay itself out in
// three grid rows — 64 px of header, the felt, 150 px of dock — and a card on a four-seat table
// at 1920 x 1080 measured 68 px across for it. The same card is 82 px with the rows gone and
// their contents moved into the column, which is the difference between a card that has to be
// pointed at to be told apart and one that does not (`tv-card-size.test.ts`, K8).
export function TvChrome({ view, activity, roomCode, joinUrl, title, version, inspecting, faces, showing, onDismiss, observers = [], note, rules, children }: TvChromeProps) {
  // A card whose words are smaller than the wizard's frame is shown taller (#523), into the felt's
  // height, until they read from the sofa: the height its width needs, which the stylesheet lets past
  // the 938 px the frame's own card stops at.
  const showPt = useSmallestPt(faces, showing?.card)
  const showNeed = readingWidth(0, showPt, 'tv') * CARD_STANDARD_63x88.physical.heightMm / CARD_STANDARD_63x88.physical.widthMm
  const t = useT()
  const handCount = (seat: string) => {
    const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === seat)
    if (!hand) return 0
    return hand.mode === 'count' ? hand.count : hand.order.length
  }
  const seatIndex = (seat: string) => Math.max(0, view.seats.findIndex((s) => s.id === seat))
  // Three lines (#482 fynd 6, beslut B): the newest large, as the thing the room looks up for, and
  // two before it small. The whole history is on every phone; the television keeps what a glance
  // from the sofa takes in.
  const recent = sayable(activity).slice(-3).reverse()
  // A full table stands its seats on one line each (#482 fynd 6, beslut 2026-09-27, prototyp 22):
  // up to six, three lines each fit whole at 1920 × 1080; seven and eight do not, and a dock
  // scrolled to a half-drawn seat reads as a broken row. The sizes stay; what goes is the line of
  // what the seat last did, which the feed under it already says in the seat's colour.
  const dense = view.seats.length >= DENSE_SEATS
  // Only the lines that fit whole (#482): nobody scrolls a television from the sofa, and a list cut
  // through its last line — with the observers' row laid over it — read as broken. The newest stand
  // first, so what gives way is the oldest. Measured after layout and again whenever the column
  // changes size; `hidden` is the list's own and never React's, so a redraw does not undo it.
  const feedRef = useRef<HTMLElement | null>(null)
  const lines = recent.map((l) => l.seq).join(',')
  useLayoutEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    const fit = () => {
      const rows = [...feed.querySelectorAll<HTMLElement>('ol > li')]
      for (const li of rows) li.hidden = false
      const bottom = feed.getBoundingClientRect().bottom - parseFloat(getComputedStyle(feed).paddingBottom || '0')
      let full = false
      for (const li of rows) {
        full ||= li.getBoundingClientRect().bottom > bottom + 0.5
        li.hidden = full
      }
    }
    fit()
    if (typeof ResizeObserver !== 'function') return
    const watch = new ResizeObserver(fit)
    watch.observe(feed)
    return () => watch.disconnect()
  }, [lines])
  // What the panel holds when nobody is pointing (K8): the card the latest line was about, for as
  // long as it is the latest. Pointing is a good way into the panel and a bad requirement — a TV
  // is watched by a room and held by nobody — so the screen answers "what was just played?" on
  // its own, and a pointer is how you ask about something else. It is never a guess: the card is
  // looked up in the very snapshot being drawn, so a line about a card this screen can no longer
  // see leaves the panel where it was rather than naming something that is not there.
  const shown = inspecting ?? lastCard(view, activity)
  return (
    <div data-tv>
      <main>
        {children}
        {/* «Visa för alla» (#508, beslut B): over the felt and not in the column, because the felt
            is bound by its height and the column is not wide enough to hold a card the room can
            read (K26); the rest of the screen stays as it was, and the card goes by itself. */}
        {showing && (
          <div className="byd-tv-show" role="status" aria-labelledby="tv-show" onClick={onDismiss}>
            <figure>
              <div data-tv-show={showing.card.id} style={{ ...(showing.card.cardRef === null ? {} : { ['--hue' as string]: hue(showing.card.cardRef) }), ...(showNeed > 0 ? { ['--byd-show-need-h' as string]: `${showNeed}px` } : {}) }}>
                <Texture faces={faces} c={showing.card} />
                <span>{cardWord(showing.card)}</span>
              </div>
              <figcaption id="tv-show">
                <b>{showing.by === null ? t('tv.show.table') : t('tv.show.by', { name: showing.by })}</b> · {cardWord(showing.card)}
                <i key={showing.at} style={{ animationDuration: `${SHOW_MS}ms` }} />
              </figcaption>
            </figure>
          </div>
        )}
      </main>
      <aside>
        {note}
        <div className="byd-tv-head">
          <h1>
            {title ?? t('play.table')}
            {version !== undefined && <em> {version}</em>}
          </h1>
          {/* The rulebook, beside the game's own name rather than over the felt (#30). */}
          {rules}
        </div>
        {(roomCode || joinUrl) && (
          <div className="byd-tv-join byd-help-row">
            <span>{t('tv.join')}</span>
            {roomCode && <strong>{roomCode}</strong>}
            {/* One line of the TV's own heading, and nobody presses a television: the code stays a
                picture there (#225). The room's code stands beside it in plain figures anyway. */}
            {joinUrl && <QrCode text={joinUrl} label={t('qr.join.alt', { code: roomCode ?? '', url: joinUrl })} size={52} enlarge={false} />}
            {/* The one help pattern (L32, #305), after the code and the square rather than in
                front of them: what the room reads from across it comes first, and what a joined
                phone becomes is behind the question mark instead of on a second line over the
                felt. The row is the box's anchor, so a box that turns upward clears the code and
                not merely the ring. */}
            <Help topic={t('tv.join.help.topic')}>
              <p>{t('tv.join.help.how')}</p>
              <p>{t('tv.join.help.phone')}</p>
            </Help>
          </div>
        )}
        <section className="byd-tv-inspect" aria-labelledby="tv-inspect">
          <h2 id="tv-inspect">{t('tv.inspect')}</h2>
          {shown ? (
            <div
              data-inspect={shown.id}
              data-face={shown.cardRef === null ? 'back' : 'front'}
              style={shown.cardRef === null ? undefined : { ['--hue' as string]: hue(shown.cardRef) }}
            >
              <Texture faces={faces} c={shown} />
              <span>{cardWord(shown) ?? t('tv.inspect.hidden')}</span>
            </div>
          ) : (
            <div data-empty>
              <span>{t('tv.inspect.empty')}</span>
            </div>
          )}
        </section>
        <section className="byd-tv-seats" aria-labelledby="tv-seats">
          <h2 id="tv-seats">{t('tv.seats')}</h2>
          <ul aria-labelledby="tv-seats" data-dense={dense ? '' : undefined}>
            {view.seats.map((s, i) => {
              const last = sayable(activity).reverse().find((l) => l.by === s.id)
              return (
                <li key={s.id} style={{ ['--seat' as string]: seatColor(i) }}>
                  <i data-avatar>{(s.name ?? s.id).slice(0, 1)}</i>
                  <div>
                    <span>{s.name ?? s.id}</span>
                    <span>{t(`tv.seat.hand${dense ? '.short' : ''}.${handCount(s.id) === 1 ? 'one' : 'other'}`, { n: handCount(s.id) })}</span>
                    {!dense && <small>{last ? describeActivity(last, view, t) : t('tv.seat.none')}</small>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="byd-tv-feed" ref={feedRef}>
          <h2 id="tv-feed">{t('play.latest')}</h2>
          {/* A table nobody has touched yet (UX-16): the heading says what will fill it, rather
              than standing over an empty list. The list itself comes back with the first line. */}
          {recent.length === 0 ? (
            <p data-empty>{t('tv.latest.empty')}</p>
          ) : (
            <ol aria-labelledby="tv-feed">
              {recent.map((l) => (
                <li key={l.seq} style={l.by === null ? undefined : { ['--seat' as string]: seatColor(seatIndex(l.by)) }}>
                  <b>{l.seq}</b>
                  <span>{describeActivity(l, view, t)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        {observers.length > 0 && (
          <div className="byd-tv-observers" data-observers>
            <i />
            <span>{t(observers.length === 1 ? 'tv.observers.one' : 'tv.observers.other', { names: observers.map((o) => o.name).join(', ') })}</span>
          </div>
        )}
      </aside>
    </div>
  )
}

// The newest line that is about a card the screen can still draw. Walked from the end rather than
// read off the last line alone: a flip is followed by lines about nothing — a seat sitting down, a
// shuffle — and the panel should not empty itself because somebody else did something else.
function lastCard(view: Snapshot, activity: readonly Activity[]): VisibleComponentState | null {
  for (let i = activity.length - 1; i >= 0; i--) {
    const line = activity[i]
    const id = line === undefined ? null : componentOf(line)
    if (id === null) continue
    const card = view.components.find((c) => c.id === id)
    if (card) return card
  }
  return null
}

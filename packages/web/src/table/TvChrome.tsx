import type { ReactNode } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import { describeActivity } from './describe.js'
import { seatColor } from './seatColor.js'
import { QrCode } from './QrCode.js'
import { Texture } from './Texture.js'
import { hue } from './hue.js'
import { componentOf } from './presence.js'
import { Help } from '../editor/HelpDrawer.js'
import { useT } from '../i18n/index.js'

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
export function TvChrome({ view, activity, roomCode, joinUrl, title, version, inspecting, faces, observers = [], note, rules, children }: TvChromeProps) {
  const t = useT()
  const handCount = (seat: string) => {
    const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === seat)
    if (!hand) return 0
    return hand.mode === 'count' ? hand.count : hand.order.length
  }
  const seatIndex = (seat: string) => Math.max(0, view.seats.findIndex((s) => s.id === seat))
  const recent = [...activity].slice(-9).reverse()
  // What the panel holds when nobody is pointing (K8): the card the latest line was about, for as
  // long as it is the latest. Pointing is a good way into the panel and a bad requirement — a TV
  // is watched by a room and held by nobody — so the screen answers "what was just played?" on
  // its own, and a pointer is how you ask about something else. It is never a guess: the card is
  // looked up in the very snapshot being drawn, so a line about a card this screen can no longer
  // see leaves the panel where it was rather than naming something that is not there.
  const shown = inspecting ?? lastCard(view, activity)
  return (
    <div data-tv>
      <main>{children}</main>
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
            {joinUrl && <QrCode text={joinUrl} size={52} enlarge={false} />}
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
              <span>{shown.cardRef ?? t('tv.inspect.hidden')}</span>
            </div>
          ) : (
            <div data-empty>
              <span>{t('tv.inspect.empty')}</span>
            </div>
          )}
        </section>
        <section className="byd-tv-seats" aria-labelledby="tv-seats">
          <h2 id="tv-seats">{t('tv.seats')}</h2>
          <ul aria-labelledby="tv-seats">
            {view.seats.map((s, i) => {
              const last = [...activity].reverse().find((l) => l.by === s.id)
              return (
                <li key={s.id} style={{ ['--seat' as string]: seatColor(i) }}>
                  <i data-avatar>{(s.name ?? s.id).slice(0, 1)}</i>
                  <div>
                    <span>{s.name ?? s.id}</span>
                    <span>{t(handCount(s.id) === 1 ? 'tv.seat.hand.one' : 'tv.seat.hand.other', { n: handCount(s.id) })}</span>
                    <small>{last ? describeActivity(last, view, t) : t('tv.seat.none')}</small>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
        <section className="byd-tv-feed">
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

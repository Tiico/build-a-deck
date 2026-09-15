import { useEffect, useRef, useState } from 'react'
import type { TableConnection } from '../table/useTableClient.js'
import { connectionState, countdownFrom, DEFAULT_TIMING, isStale, type StatusTiming } from './connection.js'
import { asOf, noticeFor, type Notice, type StatusKey, type Voice } from './notice.js'
import { useT } from '../i18n/index.js'
import type { Countdown } from './StatusNotice.js'

// How long "uppkopplad igen" stays on the screen. Long enough to be read across a room, short
// enough that a table is not left with a message about something that is over.
const RESUMED_MS = 4_000

export type LiveStatus = {
  state: StatusKey | null
  notice: Notice | null
  countdown: Countdown | null
  // Whether what is behind the message has stopped being true.
  stale: boolean
  // The clock the data behind was last known good at, or null when nothing stale is shown.
  asOf: string | null
}

// One connection turned into one of the nine states, in the words of one route. Everything a
// live route needs to say about itself, and the only place that decides it.
export function useLiveStatus(conn: TableConnection, voice: Voice, timing: StatusTiming = DEFAULT_TIMING): LiveStatus {
  const t = useT()
  const { status, view, trouble, schedule } = conn
  const hasView = view !== null

  // The wait is counted from the first attempt of this connection, and starts over when a
  // person asks for another one.
  const [since, setSince] = useState(() => Date.now())
  const [, tick] = useState(0)
  useEffect(() => {
    if (hasView || trouble !== null) return
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, timing.slowAfterMs - (Date.now() - since) + 50))
    return () => clearTimeout(timer)
  }, [hasView, trouble, since, timing.slowAfterMs])
  const wasTrying = useRef(false)
  useEffect(() => {
    if (status === 'connecting' && !wasTrying.current) setSince(Date.now())
    wasTrying.current = status === 'connecting'
  }, [status])

  // When the line went. One clock answers everything that is about the break rather than about
  // the message: how long the line has been gone, how old the picture standing on the screen is,
  // and — on the other side of it — whether the break was ever long enough to have been said.
  // It is kept past the mending for that last question and cleared once it is answered.
  const went = useRef<number | null>(null)
  const lineDown = trouble !== null || (status === 'reconnecting' && hasView)
  if (lineDown) went.current ??= Date.now()
  const downSince = lineDown ? went.current : null

  // The grace has to end even when nothing else changes, or a line that stays down would be
  // announced only by the next thing that happened to re-render the route.
  useEffect(() => {
    if (downSince === null) return
    const timer = setTimeout(() => tick((n) => n + 1), Math.max(0, timing.dropAfterMs - (Date.now() - downSince) + 50))
    return () => clearTimeout(timer)
  }, [downSince, timing.dropAfterMs])

  // A connection that comes back says so once. Without the reader being told, a table that went
  // grey and came back again is just a screen that flickered — but only a reader who was told it
  // went needs telling it is back. A break that healed inside the grace was never said, and
  // "uppkopplad igen" about something nobody saw happen is the same flicker one step further on.
  const [resumedAt, setResumedAt] = useState<number | null>(null)
  useEffect(() => {
    if (lineDown) return
    const broke = went.current
    went.current = null
    // Read off the clock and not off what was rendered: whether the reader was told is a fact
    // about how long the line was gone, so a timer that fires late cannot turn a break that was
    // announced into one that silently was not.
    if (broke !== null && hasView && Date.now() - broke > timing.dropAfterMs) setResumedAt(Date.now())
  }, [lineDown, hasView, timing.dropAfterMs])
  useEffect(() => {
    if (resumedAt === null) return
    const timer = setTimeout(() => setResumedAt(null), RESUMED_MS)
    return () => clearTimeout(timer)
  }, [resumedAt])

  const state = connectionState({
    status,
    hasView,
    trouble,
    waitedMs: Date.now() - since,
    slowAfterMs: timing.slowAfterMs,
    downMs: downSince === null ? 0 : Date.now() - downSince,
    dropAfterMs: timing.dropAfterMs,
    resumed: resumedAt !== null,
  })

  // When the picture was last true. Read from the break itself, so it is the age of the data and
  // not the age of the message — the two are a whole grace apart.
  const stamp = useRef<string | null>(null)
  if (state !== 'dropped') stamp.current = null
  else stamp.current ??= asOf(new Date(downSince ?? Date.now()))

  // The countdown re-reads the clock every second while an attempt is pending, so the number
  // changes rather than something moving — which is what makes it survive reduced motion.
  const [now, setNow] = useState(() => Date.now())
  const pending = schedule.nextRetryAt
  useEffect(() => {
    if (pending === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(timer)
  }, [pending])

  return {
    state,
    notice: state ? noticeFor(state, voice, t) : null,
    countdown: state === 'dropped' ? countdownFrom(schedule, now) : null,
    stale: isStale(state),
    asOf: stamp.current,
  }
}

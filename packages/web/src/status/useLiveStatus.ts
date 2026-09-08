import { useEffect, useRef, useState } from 'react'
import type { TableConnection } from '../table/useTableClient.js'
import { connectionState, countdownFrom, DEFAULT_TIMING, isStale, type StatusTiming } from './connection.js'
import { asOf, noticeFor, type Notice, type StatusKey, type Voice } from './notice.js'
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

  // A connection that comes back says so once. Without the reader being told, a table that went
  // grey and came back again is just a screen that flickered.
  const dropped = status === 'reconnecting' || trouble !== null
  const [resumedAt, setResumedAt] = useState<number | null>(null)
  const wasDropped = useRef(false)
  useEffect(() => {
    if (wasDropped.current && !dropped && hasView) setResumedAt(Date.now())
    wasDropped.current = dropped && hasView
  }, [dropped, hasView])
  useEffect(() => {
    if (resumedAt === null) return
    const timer = setTimeout(() => setResumedAt(null), RESUMED_MS)
    return () => clearTimeout(timer)
  }, [resumedAt])

  const state = connectionState({ status, hasView, trouble, waitedMs: Date.now() - since, slowAfterMs: timing.slowAfterMs, resumed: resumedAt !== null })

  // When the picture was last true. Read at the moment it stops being true, so it is the age of
  // the data and not the age of the message.
  const stamp = useRef<string | null>(null)
  if (state !== 'dropped') stamp.current = null
  else stamp.current ??= asOf(new Date())

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
    notice: state ? noticeFor(state, voice) : null,
    countdown: state === 'dropped' ? countdownFrom(schedule, now) : null,
    stale: isStale(state),
    asOf: stamp.current,
  }
}

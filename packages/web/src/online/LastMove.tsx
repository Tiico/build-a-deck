import { useEffect, useState } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from '../table/describe.js'
import { seatColor } from '../table/seatColor.js'
import { useT } from '../i18n/index.js'

// What somebody else just did, still said after its ring on the felt has gone (#484 fynd 12, beslut
// A, prototyp 26). The ring lasts 1.6 s (`RECENT_MS`) and the screen reader is told once; a player
// who looked away for the length of a sip had nothing left to read. So the top bar keeps the newest
// line that is not this seat's own — the sentence the screen reader was given, in the seat's colour —
// and how long ago it was, until somebody else moves. It costs the felt nothing: the bar is there.
//
// Not a live region: `useActivityLive` already says the line once, and a second voice would say it
// twice.
export function LastMove({ view, activity, seat }: { view: Snapshot; activity: readonly Activity[]; seat: string }) {
  const t = useT()
  const line = [...activity].reverse().find((l) => l.by !== seat)
  const now = useNow(line !== undefined)
  if (!line) return null
  const index = line.by === null ? -1 : view.seats.findIndex((s) => s.id === line.by)
  const ago = Math.max(0, Math.round((now - Date.parse(line.at)) / 1000))
  const age = ago < 10 ? t('online.last.now') : ago < 60 ? t('online.last.s', { n: ago }) : t('online.last.min', { n: Math.floor(ago / 60) })
  return (
    // A line the table itself made belongs to no seat; `--seat` is set on the page for this seat's
    // own colour, so it is said outright rather than left to inherit.
    <p className="byd-online-last" data-last-move style={{ ['--seat' as string]: index < 0 ? 'var(--byd-last-table)' : seatColor(index) }}>
      {t('online.last')} <span>{describeActivity(line, view, t)}</span> · <small>{age}</small>
    </p>
  )
}

// The clock the age is read against, ticking while there is an age to say.
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!ticking) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [ticking])
  return now
}

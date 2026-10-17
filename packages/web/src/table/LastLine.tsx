import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity, sayable } from './describe.js'
import { useT, type T } from '../i18n/index.js'
import { useAfterSheet } from './after.js'

// The corner of the felt's own screen (#682, beställarens beslut: raden E). The table screen had
// no feed — the TV's SENAST is the TV's — so what had just happened at the table, a shuffle or a
// draw, was said in the live region and then gone: nobody standing at the felt could read it
// afterwards. The last line stands here until the next one, with how long ago it happened.
//
// It is the very sentence the live region says (`describeActivity`), so the screen and the reader
// are told the same thing in the same words. A refusal is never here: that stands beside the drop
// it is about, and fades (D5).
//
// Bottom left on the wood and the dark around it, the mirror of «Starta om» and «?» in the other
// corner, and never as wide as the seat whose name stands at the bottom rim: it covers nothing at
// 1024, 1280 or 1920 (prototype 2026-10-17, `docs/ux-audits/2026-10-17-bordslaget-text-och-kontroller`).
const AIR = 16

export function LastLine({ activity, view }: { activity: readonly Activity[]; view: Snapshot }) {
  const t = useT()
  const dressed = useAfterSheet()
  // When this screen first heard each line. A line that arrives while it watches happened just
  // now by this screen's own clock; one the snapshot brought is as old as the server wrote.
  const heard = useRef<Map<number, number> | null>(null)
  if (heard.current === null) heard.current = new Map(activity.map((l) => [l.seq, Date.parse(l.at)]))
  const last = sayable(activity).at(-1)
  if (last && !heard.current.has(last.seq)) heard.current.set(last.seq, Date.now())
  const at = last ? (heard.current.get(last.seq) ?? Date.now()) : null
  // The age is read off the clock once a second, here and nowhere else: the felt is not drawn again.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (at === null) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [at])
  const [room, setRoom] = useState<number | null>(null)
  useLayoutEffect(() => {
    const measure = () => {
      // As far as the leftmost name standing at the bottom rim, and no further.
      const names = [...document.querySelectorAll('.byd-seat-name')].map((n) => n.getBoundingClientRect()).filter((r) => r.width > 0)
      const bottom = Math.max(...names.map((r) => r.bottom))
      const lowest = names.filter((r) => r.bottom > bottom - 40)
      const edge = lowest.length > 0 ? Math.min(...lowest.map((r) => r.left)) : window.innerWidth / 2
      setRoom(Math.max(0, edge - 2 * AIR))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [last?.seq, view.seats.length])
  if (!last || at === null || !dressed) return null
  return (
    <p className="byd-table-last" data-table-last="" style={room === null ? undefined : { maxWidth: room }}>
      <b>{t('table.last')}</b> {describeActivity(last, view, t)} <span>· {ago(now - at, t)}</span>
    </p>
  )
}

function ago(ms: number, t: T): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 10) return t('table.last.now')
  if (s < 60) return t('table.last.seconds', { n: s })
  if (s < 3600) return t('table.last.minutes', { n: Math.floor(s / 60) })
  return t('table.last.hours', { n: Math.floor(s / 3600) })
}

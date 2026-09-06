import type { ReactNode } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from './describe.js'
import { seatColor } from './seatColor.js'
import { QrCode } from './QrCode.js'

export type TvChromeProps = {
  view: Snapshot
  activity: readonly Activity[]
  roomCode: string
  joinUrl?: string | undefined
  // Who is watching (C8): observers are never invisible.
  observers?: readonly { id: string; name: string }[] | undefined
  children: ReactNode
}

// TV mode (C5, prototype C): the table in the middle, a header with the room code to join by,
// a dock with every seat, and what just happened in words — all legible from across a room.
export function TvChrome({ view, activity, roomCode, joinUrl, observers = [], children }: TvChromeProps) {
  const handCount = (seat: string) => {
    const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === seat)
    if (!hand) return 0
    return hand.mode === 'count' ? hand.count : hand.order.length
  }
  const recent = [...activity].slice(-9).reverse()
  return (
    <div data-tv>
      <header>
        <span>anslut med telefon</span>
        <div className="byd-tv-join">
          {joinUrl && <small>{joinUrl.replace(/^https?:\/\//, '')}</small>}
          <strong>{roomCode}</strong>
          {joinUrl && <QrCode text={joinUrl} size={52} />}
        </div>
      </header>
      <main>{children}</main>
      <aside>
        <h2 id="tv-feed">Senast</h2>
        <ol aria-labelledby="tv-feed">
          {recent.map((l) => (
            <li key={l.seq}>{describeActivity(l, view)}</li>
          ))}
        </ol>
      </aside>
      <footer>
        {observers.length > 0 && (
          <div className="byd-tv-observers" data-observers>
            <i />
            <span>
              {observers.map((o) => o.name).join(', ')} tittar på · ser allt
            </span>
          </div>
        )}
        <h2 id="tv-seats">Platser</h2>
        <ul aria-labelledby="tv-seats">
          {view.seats.map((s, i) => (
            <li key={s.id} style={{ ['--seat' as string]: seatColor(i) }}>
              <span>{s.name ?? s.id}</span> <span>{handCount(s.id)} kort</span>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  )
}

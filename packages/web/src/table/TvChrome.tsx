import type { ReactNode } from 'react'
import type { Activity, Snapshot } from '@byd/protocol'
import { describeActivity } from './describe.js'

export type TvChromeProps = { view: Snapshot; activity: readonly Activity[]; roomCode: string; children: ReactNode }

// TV mode (C5, prototype C): the table in the middle, a header with the room code to join by,
// a dock with every seat, and what just happened in words — all legible from across a room.
export function TvChrome({ view, activity, roomCode, children }: TvChromeProps) {
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
        <strong>{roomCode}</strong>
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
        <h2 id="tv-seats">Platser</h2>
        <ul aria-labelledby="tv-seats">
          {view.seats.map((s) => (
            <li key={s.id}>
              <span>{s.name ?? s.id}</span> <span>{handCount(s.id)} kort</span>
            </li>
          ))}
        </ul>
      </footer>
    </div>
  )
}

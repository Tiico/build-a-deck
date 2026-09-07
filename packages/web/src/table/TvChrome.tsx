import type { ReactNode } from 'react'
import type { Activity, Snapshot, VisibleComponentState } from '@byd/protocol'
import { describeActivity } from './describe.js'
import { seatColor } from './seatColor.js'
import { QrCode } from './QrCode.js'
import { Texture } from './Texture.js'
import { hue } from './hue.js'

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
  // room, since a TV has no one holding it. `faces` is where its texture is fetched from.
  inspecting?: VisibleComponentState | null | undefined
  faces?: string | undefined
  // Who is watching (C8): observers are never invisible.
  observers?: readonly { id: string; name: string }[] | undefined
  children: ReactNode
}

// TV mode (C5, prototype C): the table in the middle, a header with the room code to join by,
// a dock with every seat, and what just happened in words — all legible from across a room.
export function TvChrome({ view, activity, roomCode, joinUrl, title, version, inspecting, faces, observers = [], children }: TvChromeProps) {
  const handCount = (seat: string) => {
    const hand = view.zones.find((z) => z.kind === 'hand' && z.owner === seat)
    if (!hand) return 0
    return hand.mode === 'count' ? hand.count : hand.order.length
  }
  const seatIndex = (seat: string) => Math.max(0, view.seats.findIndex((s) => s.id === seat))
  const recent = [...activity].slice(-9).reverse()
  return (
    <div data-tv>
      <header>
        <h1>
          {title ?? 'Bordet'}
          {version !== undefined && <em> {version}</em>}
        </h1>
        {(roomCode || joinUrl) && (
          <div className="byd-tv-join">
            <span>anslut med telefon</span>
            {roomCode && <strong>{roomCode}</strong>}
            {joinUrl && <QrCode text={joinUrl} size={52} />}
          </div>
        )}
      </header>
      <main>{children}</main>
      <aside>
        <section className="byd-tv-inspect" aria-labelledby="tv-inspect">
          <h2 id="tv-inspect">Inspektion</h2>
          {inspecting ? (
            <div
              data-inspect={inspecting.id}
              data-face={inspecting.cardRef === null ? 'back' : 'front'}
              style={inspecting.cardRef === null ? undefined : { ['--hue' as string]: hue(inspecting.cardRef) }}
            >
              <Texture faces={faces} c={inspecting} />
              <span>{inspecting.cardRef ?? 'dolt kort'}</span>
            </div>
          ) : (
            <div data-empty>
              <span>peka på ett kort</span>
            </div>
          )}
        </section>
        <section className="byd-tv-feed">
          <h2 id="tv-feed">Senast</h2>
          <ol aria-labelledby="tv-feed">
            {recent.map((l) => (
              <li key={l.seq} style={l.by === null ? undefined : { ['--seat' as string]: seatColor(seatIndex(l.by)) }}>
                <b>{l.seq}</b>
                <span>{describeActivity(l, view)}</span>
              </li>
            ))}
          </ol>
        </section>
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
          {view.seats.map((s, i) => {
            const last = [...activity].reverse().find((l) => l.by === s.id)
            return (
              <li key={s.id} style={{ ['--seat' as string]: seatColor(i) }}>
                <i data-avatar>{(s.name ?? s.id).slice(0, 1)}</i>
                <div>
                  <span>{s.name ?? s.id}</span>
                  <span>{handCount(s.id)} kort på hand</span>
                  <small>{last ? describeActivity(last, view) : '—'}</small>
                </div>
              </li>
            )
          })}
        </ul>
      </footer>
    </div>
  )
}

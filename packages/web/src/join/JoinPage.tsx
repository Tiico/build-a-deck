import { useMemo, useState } from 'react'
import { useTableClient } from '../table/useTableClient.js'
import { seatColor } from '../table/seatColor.js'
import { seatEdge, type Edge } from './edges.js'
import './join.css'

// /join?session=…&server=ws://…  — what the QR on the TV points at.
// Sits down at the table (A with C's preselection, K12): the table as a seat picker with the
// next free seat chosen already, so the indifferent just type a name and go.
export type JoinPageProps = { onSit?(url: string): void }

export function JoinPage({ onSit = (url) => location.assign(url) }: JoinPageProps) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const sessionId = params.get('session')
  const server = params.get('server')
  const url = server ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  // Looking at the seats needs no seat: the table role sees them.
  const { view, status } = useTableClient(sessionId ? { url, sessionId, seat: null } : null)
  const [pick, setPick] = useState<string | null>(null)
  const [name, setName] = useState('')

  const free = view?.seats.filter((s) => s.name === null) ?? []
  // The next free seat is chosen until you choose another; a pick someone else just took is let go.
  const chosen = pick && free.some((s) => s.id === pick) ? pick : (free[0]?.id ?? null)

  if (!sessionId) return <p>Ingen session angiven.</p>
  if (!view) return <p data-status={status}>Ansluter…</p>

  const sit = () => {
    if (!chosen || !name.trim()) return
    const next = new URLSearchParams({ session: sessionId, seat: chosen, name: name.trim() })
    if (server) next.set('server', server)
    onSit(`/play?${next.toString()}`)
  }
  // Watching instead (C8): seatless, sees everything, announced to everyone.
  const observe = () => {
    if (!name.trim()) return
    const next = new URLSearchParams({ session: sessionId, name: name.trim() })
    if (server) next.set('server', server)
    onSit(`/observe?${next.toString()}`)
  }

  return (
    <div className="byd-join" data-page="join">
      <header>
        <span>Du är på väg in i</span>
        <strong>Rum {sessionId}</strong>
        <span>{chosen ? `Plats ${chosen} vald` : free.length === 0 ? 'Alla platser är upptagna' : 'Tryck på en ledig plats'}</span>
      </header>
      <div className="byd-join-table">
        {view.seats.map((s, i) => {
          const taken = s.name !== null
          const edge: Edge = seatEdge(view, s.id)
          return (
            <button
              key={s.id}
              type="button"
              data-seat={s.id}
              data-edge={edge}
              aria-disabled={taken ? 'true' : 'false'}
              aria-pressed={chosen === s.id ? 'true' : 'false'}
              onClick={() => !taken && setPick(s.id)}
              style={{ ['--seat' as string]: seatColor(i) }}
            >
              {s.name ?? 'ledig'}
            </button>
          )
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          sit()
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ditt namn" aria-label="Ditt namn" autoComplete="nickname" />
        <button type="submit" disabled={!chosen || !name.trim()}>
          Sätt dig
        </button>
        <button type="button" className="byd-join-observe" disabled={!name.trim()} onClick={observe}>
          Bara titta (ser allt, alla ser dig)
        </button>
      </form>
    </div>
  )
}

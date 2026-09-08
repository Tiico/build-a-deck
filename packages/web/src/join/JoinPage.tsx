import { useEffect, useMemo, useState } from 'react'
import { useTableClient } from '../table/useTableClient.js'
import { seatColor } from '../table/seatColor.js'
import { seatEdge, type Edge } from './edges.js'
import { useT } from '../i18n/index.js'
import './join.css'

// /join?code=…&server=ws://…  — what the QR on the TV points at, and what a typed code leads to.
// Sits down at the table (A with C's preselection, K12): the table as a seat picker with the
// next free seat chosen already, so the indifferent just type a name and go. The code buys a
// token for the seat (DRIFT §9); the token is what the phone connects with.
export type JoinPageProps = { onSit?(url: string): void }

export function JoinPage({ onSit = (url) => location.assign(url) }: JoinPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const code = params.get('code')
  const server = params.get('server')
  const url = server ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  // The code resolves to a session while it lives; an unknown or lapsed one says so.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  useEffect(() => {
    if (!code) return
    void fetch(`${http}/rooms/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ session: string }>) : Promise.reject(new Error(String(r.status)))))
      .then((r) => setSessionId(r.session))
      .catch(() => setGone(true))
  }, [code, http])
  // Looking at the seats needs no seat: the lobby role sees them and may do nothing else.
  const { view, status } = useTableClient(sessionId ? { url, sessionId, seat: null, lobby: true } : null)
  const [pick, setPick] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const free = view?.seats.filter((s) => s.name === null) ?? []
  // The next free seat is chosen until you choose another; a pick someone else just took is let go.
  const chosen = pick && free.some((s) => s.id === pick) ? pick : (free[0]?.id ?? null)

  if (!code) return <p>{t('join.code.missing')}</p>
  if (gone) return <p role="alert">{t('join.code.gone', { code: code.toUpperCase() })}</p>
  if (!view || !sessionId) return <p data-status={status}>{t('play.connecting')}</p>

  // The way in: a token for the seat (or for watching), then the page for it.
  const admit = async (seat: string | null): Promise<string | null> => {
    const res = await fetch(`${http}/rooms/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), ...(seat === null ? {} : { seat }) }),
    })
    if (res.status === 409) {
      setProblem(t('join.seat.taken'))
      return null
    }
    if (!res.ok) {
      setProblem(t('join.code.expired'))
      return null
    }
    return ((await res.json()) as { token: string }).token
  }
  const go = async (page: '/play' | '/online' | '/observe', seat: string | null) => {
    if (!name.trim() || (page !== '/observe' && !seat)) return
    const token = await admit(seat)
    if (!token) return
    const next = new URLSearchParams({ session: sessionId, ...(seat === null ? {} : { seat }), name: name.trim(), token })
    if (server) next.set('server', server)
    onSit(`${page}?${next.toString()}`)
  }

  return (
    <div className="byd-join" data-page="join">
      <header>
        <span>{t('join.into')}</span>
        <strong>{t('join.room', { code: code.toUpperCase() })}</strong>
        <span>{chosen ? t('join.seat.chosen', { seat: chosen }) : t(free.length === 0 ? 'join.seats.full' : 'join.seat.pick')}</span>
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
              {s.name ?? t('join.seat.free')}
            </button>
          )
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void go('/play', chosen)
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('join.name')} aria-label={t('join.name')} autoComplete="nickname" />
        {problem && <p role="alert">{problem}</p>}
        <button type="submit" disabled={!chosen || !name.trim()}>
          {t('join.sit')}
        </button>
        <button type="button" className="byd-join-online" disabled={!chosen || !name.trim()} onClick={() => void go('/online', chosen)}>
          {t('join.online')}
        </button>
        <button type="button" className="byd-join-observe" disabled={!name.trim()} onClick={() => void go('/observe', null)}>
          {t('join.observe')}
        </button>
      </form>
    </div>
  )
}

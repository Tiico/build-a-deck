import { useEffect, useMemo, useState } from 'react'
import type { SeatView } from '@byd/protocol'
import { useTableClient } from '../table/useTableClient.js'
import { seatColor } from '../table/seatColor.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { useT } from '../i18n/index.js'
import './join.css'

// /join?code=…&server=ws://…  — what the QR on the TV points at, and what a typed code leads to.
// Sits down at the table (A with C's preselection, K12): the table as a seat picker with the
// next free seat chosen already, so the indifferent just type a name and go. The code buys a
// token for the seat (DRIFT §9); the token is what the phone connects with.
export type JoinPageProps = { onSit?(url: string): void; timing?: StatusTiming }

// A table has four sides and may seat eight, so past four players two seats share a side (#42).
// Where along that side each of them stands is not a fact about the table — it is how the picker
// draws one — so it is counted here, from the edges the seat list already carries, and handed to
// the stylesheet. Nothing in the protocol has to say it.
type Along = { at: number; of: number }
function along(seats: readonly SeatView[]): Map<string, Along> {
  const sides = new Map<string, SeatView[]>()
  for (const seat of seats) {
    if (seat.edge === null) continue
    const side = sides.get(seat.edge) ?? []
    side.push(seat)
    sides.set(seat.edge, side)
  }
  const out = new Map<string, Along>()
  for (const side of sides.values()) side.forEach((seat, at) => out.set(seat.id, { at, of: side.length }))
  return out
}

export function JoinPage({ onSit = (url) => location.assign(url), timing = DEFAULT_TIMING }: JoinPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const code = params.get('code')
  const server = params.get('server')
  const url = server ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  // The code resolves to a session while it lives. Looking it up is a hop like any other, so it
  // carries the same deadline the socket does (#7): without one, "kopplar upp" stands for ever.
  // And the two ways it can fail are two different states — a code the server will not honour is
  // a room that is gone, a line that answers nothing is the service being unreachable.
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [lookup, setLookup] = useState<'gone' | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!code) return
    let alive = true
    // The deadline is a race and not an abort: what matters is that the page stops waiting, and
    // a fetch left running answers into a `alive` that is already false.
    const deadline = setTimeout(() => alive && setLookup('offline'), timing.connectTimeoutMs)
    void fetch(`${http}/rooms/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (!alive) return
        clearTimeout(deadline)
        if (r.ok) setSessionId(((await r.json()) as { session: string }).session)
        // A code the server has heard of and will not honour is a room that is gone; anything
        // else it answers, or does not answer, is the service.
        else setLookup(r.status === 404 || r.status === 410 ? 'gone' : 'offline')
      })
      .catch(() => {
        if (!alive) return
        clearTimeout(deadline)
        setLookup('offline')
      })
    return () => {
      alive = false
      clearTimeout(deadline)
    }
  }, [code, http, attempt, timing.connectTimeoutMs])
  // Looking at the seats needs no seat: the lobby role sees them and may do nothing else.
  const conn = useTableClient(sessionId ? { url, sessionId, seat: null, lobby: true, connectTimeoutMs: timing.connectTimeoutMs, retryPlanMs: timing.retryPlanMs } : null)
  const { view } = conn
  // A phone answers under the thumb: a sheet at the bottom, where its own sheets already are.
  const live = useLiveStatus(conn, 'phone', timing)
  const links = statusLinks({ server, code })
  // Asking again starts the whole way in over: the lookup first, then the socket it leads to.
  const retry = () => {
    setLookup(null)
    setAttempt((n) => n + 1)
    conn.retry()
  }
  const [pick, setPick] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // The room is the tab's name here (#12): a phone with three tabs open has to be able to tell
  // which room each of them is waiting to get into.
  usePageTitle({ state: !code ? 'missing' : lookup === 'gone' ? 'missing' : lookup ?? live.state, room: code })

  const free = view?.seats.filter((s) => s.name === null) ?? []
  const spread = along(view?.seats ?? [])
  // The felt itself has to know whether any edge carries company, because the room a pair needs is
  // room the felt has to make (#42). It is the same reading the pills use, asked of the whole
  // table rather than of one seat, so the two can never disagree.
  const shared = [...spread.values()].some((place) => place.of > 1)
  // The next free seat is chosen until you choose another; a pick someone else just took is let go.
  const chosen = pick && free.some((s) => s.id === pick) ? pick : (free[0]?.id ?? null)

  // A code that names nothing — never issued, or lapsed — is the phone's 404. It is one of the
  // nine states like any other, said in the words the room it failed to reach would have used.
  if (!code) return <StatusNotice notice={noticeFor('missing', 'phone', t)} surface="page" links={links} />
  if (lookup === 'gone') return <StatusNotice notice={{ ...noticeFor('missing', 'phone', t), text: t('join.code.gone', { code: code.toUpperCase() }) }} surface="page" links={links} />
  if (lookup === 'offline') return <StatusNotice notice={noticeFor('offline', 'phone', t)} surface="page" links={links} onRetry={retry} />
  if (!view || !sessionId) return <RouteStatus status={live} over="sheet" links={links} onRetry={retry} />

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
    // The code travels with them: it is the only way back to this picker (#12, DRIFT §9).
    const next = new URLSearchParams({ session: sessionId, code, ...(seat === null ? {} : { seat }), name: name.trim(), token })
    if (server) next.set('server', server)
    onSit(`${page}?${next.toString()}`)
  }

  return (
    <>
      <div className={`byd-join${live.stale ? ' byd-status-stale' : ''}`} data-page="join" {...(live.stale ? { inert: true } : {})}>
      <header>
        <span>{t('join.into')}</span>
        <strong>{t('join.room', { code: code.toUpperCase() })}</strong>
        <span>{chosen ? t('join.seat.chosen', { seat: chosen }) : t(free.length === 0 ? 'join.seats.full' : 'join.seat.pick')}</span>
        {/* Whoever just left a seat comes back here (#31). The picker looks exactly as it did on
            the way in, so the acknowledgement is the only thing saying the leaving happened —
            and what became of the seat and of the hand that was on it. */}
        {params.get('left') === '1' && (
          <p className="byd-join-left" role="status">
            {t('join.left')}
          </p>
        )}
      </header>
      <div className="byd-join-table" {...(shared ? { 'data-shares': '' } : {})}>
        {view.seats.map((s, i) => {
          const taken = s.name !== null
          const place = spread.get(s.id)
          return (
            <button
              key={s.id}
              type="button"
              data-seat={s.id}
              data-edge={s.edge}
              {...(place && place.of > 1 ? { 'data-shares': '' } : {})}
              aria-disabled={taken ? 'true' : 'false'}
              aria-label={taken ? t('join.seat.label.taken', { seat: s.id, name: s.name ?? '' }) : t('join.seat.label.free', { seat: s.id })}
              aria-pressed={chosen === s.id ? 'true' : 'false'}
              onClick={() => !taken && setPick(s.id)}
              style={{ ['--seat' as string]: seatColor(i), ...(place ? { ['--seat-at' as string]: String(place.at), ['--seat-of' as string]: String(place.of) } : {}) }}
            >
              {/* The name in an element of its own, because the cut that keeps a long one out of
                  the seat beside it (#42) has to have something to take hold of: the pill is a
                  flex container, and a flex container's own text can be neither ellipsised nor
                  shrunk. What is spoken is still the button's label, so this cuts nothing. */}
              <span>{s.name ?? t('join.seat.free')}</span>
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
        <button type="button" className="byd-join-observe byd-secondary" disabled={!name.trim()} onClick={() => void go('/observe', null)}>
          {t('join.observe')}
        </button>
      </form>
      </div>
      <RouteStatus status={live} over="sheet" links={links} onRetry={retry} />
    </>
  )
}

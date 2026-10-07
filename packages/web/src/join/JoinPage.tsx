import { useEffect, useMemo, useRef, useState } from 'react'
import { codeOfAddress, type SeatView } from '@byd/protocol'
import { useTableClient } from '../table/useTableClient.js'
import { seatColor } from '../table/seatColor.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { DEFAULT_TIMING, type StatusTiming } from '../status/connection.js'
import { useLiveStatus } from '../status/useLiveStatus.js'
import { RouteStatus } from '../status/RouteStatus.js'
import { useSay } from '../status/StatusLive.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { statusLinks } from '../status/links.js'
import { noticeFor } from '../status/notice.js'
import { useT } from '../i18n/index.js'
import { useCodeField } from './codeField.js'
import { useWide } from './wide.js'
import './join.css'

// /KOD and /join?code=…&server=ws://…  — what the TV says and what its QR points at, and what a
// typed code leads to. Sits down at the table (A with C's preselection, K12): the table as a seat
// picker with the next free seat chosen already, so the indifferent just type a name and go. The
// code buys a token for the seat (DRIFT §9); the token is what the phone connects with.
//
// The code is the address (#675, beslut C 2026-10-06): the television says `värd/KOD`, and the
// phone that opens it is here, one page load from what it read. `/join` without a code asks for
// one, and a code that names nothing is asked for again with the code left in the field.
// `onSit` is where a way in leads, `onOpen` where a typed code does.
export type JoinPageProps = { onSit?(url: string): void; onOpen?(url: string): void; timing?: StatusTiming }

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

// A button at work is not a locked button (#476): it says it is busy and the handler refuses it.
const working = (on: boolean) => (on ? { 'aria-disabled': true, 'aria-busy': true } : {})

export function JoinPage({ onSit = (url) => location.assign(url), onOpen = (url) => location.assign(url), timing = DEFAULT_TIMING }: JoinPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  // The room's own address `/KOD` (#675); else `?code=KOD`, or the code on its own after the
  // question mark, the way a person types an address off the TV (#483): the first key with no
  // value that looks like a room code is the code.
  const code = codeOfAddress(location.pathname) ?? params.get('code') ?? [...params.entries()].find(([key, value]) => value === '' && /^[A-Za-z0-9]{4,8}$/.test(key))?.[0] ?? null
  const server = params.get('server')
  const wide = useWide()
  const url = server ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`
  const http = url.replace(/^ws/, 'http')
  // The code resolves to a session while it lives. Looking it up is a hop like any other, so it
  // carries the same deadline the socket does (#7): without one, "kopplar upp" stands for ever.
  // And the two ways it can fail are two different states — a code the server will not honour is
  // a room that is gone, a line that answers nothing is the service being unreachable.
  const [sessionId, setSessionId] = useState<string | null>(null)
  // The game the code leads into (#675), when the table was started from one.
  const [game, setGame] = useState<string | null>(null)
  const [lookup, setLookup] = useState<'gone' | 'ended' | 'offline' | null>(null)
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
        if (r.ok) {
          const found = (await r.json()) as { session: string; name?: string }
          setGame(found.name ?? null)
          setSessionId(found.session)
        }
        // A code the server has heard of and will not honour is a room that is gone; anything
        // else it answers, or does not answer, is the service.
        // A table that has ended is locked (C9, #485): its code still names it, but it is over.
        else setLookup(r.status === 410 ? 'ended' : r.status === 404 ? 'gone' : 'offline')
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
  // One way in at a time (#752, as «Starta nytt bord» in L31): from the first press until the
  // server has answered, the pressed button says it is at work and every way out of the form is
  // refused. `disabled` alone is not the guard — a second press or an Enter can land before the
  // re-render — so the handler holds a ref of its own. An answer that lets her in keeps the guard
  // up, since the page is on its way out; a page brought back from the history cache lets it go.
  const joining = useRef(false)
  const [busy, setBusy] = useState<'/play' | '/online' | '/observe' | null>(null)
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (!e.persisted) return
      joining.current = false
      setBusy(null)
    }
    addEventListener('pageshow', back)
    return () => removeEventListener('pageshow', back)
  }, [])
  // Namnet krävs, och villkoret sägs vid tryck (#416, variant B). Vägarna in står öppna; den som
  // trycker med tomt fält får beskedet vid fältet, fältet märkt ogiltigt och markören flyttad dit.
  // Beskedet finns inte på skärmen förrän någon tryckt, så det måste nå den som lyssnar när det
  // kommer: det ritas som en `alert`, vilket är den region som läses upp av att den kommer.
  const [says, setSays] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const saysId = 'byd-join-name-says'
  // The room is the tab's name here (#12): a phone with three tabs open has to be able to tell
  // which room each of them is waiting to get into.
  usePageTitle({ state: !code ? null : lookup === 'gone' || lookup === 'ended' ? 'missing' : lookup ?? live.state, room: code?.toUpperCase() ?? null })

  const free = view?.seats.filter((s) => s.name === null) ?? []
  const spread = along(view?.seats ?? [])
  // The felt itself has to know whether any edge carries company, because the room a pair needs is
  // room the felt has to make (#42). It is the same reading the pills use, asked of the whole
  // table rather than of one seat, so the two can never disagree.
  const shared = [...spread.values()].some((place) => place.of > 1)
  // The next free seat is an offer to a picker nobody has touched yet — never a correction of a
  // choice somebody already made with her hand (#408). Letting a hand-made pick go and quietly
  // sliding to the next free seat sat a player down somewhere she never tapped, and told her
  // nothing; so the pick stands until she moves it, and the picker says the seat was taken.
  const chosen = pick ?? free[0]?.id ?? null
  const lost = pick !== null && !free.some((s) => s.id === pick)

  // No code at all is an address without the one thing it needs, so it asks for it (#675). A code
  // that names nothing — never issued, or lapsed, or rotated away — is asked for again, with the
  // code left in the field to be put right and one sentence for all three: whether a code once
  // existed is nobody's business (beslut 2026-10-06).
  // A table that is over has no seat to choose again: the picker at the same code is this very
  // page, so it is not offered as a way out (#555).
  const { rescan: _again, ...away } = links
  if (!code) return <CodeForm server={server} onOpen={onOpen} />
  if (lookup === 'gone') return <CodeForm server={server} onOpen={onOpen} typed={code.toUpperCase()} unknown />
  if (lookup === 'ended') return <StatusNotice notice={{ ...noticeFor('missing', 'phone', t), heading: t('status.ended.table.heading'), text: t('join.ended') }} surface="page" links={away} />
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
    // The code went out, or was rotated, between the picker and the seat: said as it is said at
    // the door, because it is the same thing (#675).
    if (!res.ok) {
      setProblem(t('join.code.unknown'))
      return null
    }
    return ((await res.json()) as { token: string }).token
  }
  const go = async (page: '/play' | '/online' | '/observe', seat: string | null) => {
    // Den utgång som trycks utan namn går ingenstans — den säger vad som saknas och lämnar
    // markören där det rättas.
    if (!name.trim()) {
      setSays(t('join.name.says'))
      field.current?.focus()
      return
    }
    // A seat somebody else has just taken is not bought either: the button for it is disabled,
    // and an Enter in the field must not walk round it into a refusal.
    if (page !== '/observe' && (!seat || lost)) return
    if (joining.current) return
    joining.current = true
    setBusy(page)
    let token: string | null = null
    try {
      token = await admit(seat)
    } finally {
      if (!token) {
        joining.current = false
        setBusy(null)
      }
    }
    if (!token) return
    // The code travels with them: it is the only way back to this picker (#12, DRIFT §9).
    const next = new URLSearchParams({ session: sessionId, code, ...(seat === null ? {} : { seat }), name: name.trim(), token })
    if (server) next.set('server', server)
    onSit(`${page}?${next.toString()}`)
  }

  // The suggested way in is the first button and the one Enter takes: «Sätt dig» on a phone, and
  // playing on this screen on a laptop (#675, beslut 3), with the other as the second button.
  const suggested = wide ? '/online' : '/play'
  const room = t('join.room', { code: code.toUpperCase() })
  const seatLine = chosen ? t('join.seat.chosen', { seat: chosen }) : t(free.length === 0 ? 'join.seats.full' : 'join.seat.pick')
  const sit = (
    <button key="sit" type={wide ? 'button' : 'submit'} className={wide ? 'byd-join-sit byd-secondary' : 'byd-primary'} disabled={!chosen || lost} {...working(busy === '/play')} onClick={wide ? () => void go('/play', chosen) : undefined}>
      {busy === '/play' ? t('join.sitting') : t('join.sit')}
    </button>
  )
  const here = (
    <button key="here" type={wide ? 'submit' : 'button'} className={`byd-join-online ${wide ? 'byd-primary' : 'byd-secondary'}`} disabled={!chosen || lost} {...working(busy === '/online')} onClick={wide ? undefined : () => void go('/online', chosen)}>
      {t('join.online')}
    </button>
  )

  return (
    <div className="byd-join-page">
      <main className={`byd-join${live.stale ? ' byd-status-stale' : ''}`} data-page="join" {...(live.stale ? { inert: true } : {})}>
      <header>
        <span>{t('join.into')}</span>
        {/* The game's name, when the table has one (#675): it is what the guest came to play, and
            the room's code is the line under it. */}
        <h1>{game ?? room}</h1>
        <span>{game ? `${room} · ${seatLine}` : seatLine}</span>
        {/* Whoever just left a seat comes back here (#31). The picker looks exactly as it did on
            the way in, so the acknowledgement is the only thing saying the leaving happened —
            and what became of the seat and of the hand that was on it. */}
        {params.get('left') === '1' && (
          <p className="byd-join-left" role="status">
            {t('join.left')}
          </p>
        )}
      </header>
      <div className="byd-join-table" role="group" aria-label={t('join.seats.group')} {...(shared ? { 'data-shares': '' } : {})}>
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
              onClick={() => {
                if (taken) return
                setPick(s.id)
                // A refusal belongs to the choice it was about: choosing again is what answers it.
                setProblem(null)
              }}
              style={{ ['--seat' as string]: seatColor(i), ...(place ? { ['--seat-at' as string]: String(place.at), ['--seat-of' as string]: String(place.of) } : {}) }}
            >
              {/* The seat's own letter over the word (#80, form C). Without it a free seat said
                  only "ledig", so on the screen one was told from another by colour and place
                  alone and somebody who wanted seat C had nothing to aim at — while the letter
                  was in the spoken label and in the heading all along. It stands in both states
                  and in the same place in each, so the pill does not change shape when somebody
                  sits down.

                  The name in an element of its own, because the cut that keeps a long one out of
                  the seat beside it (#42) has to have something to take hold of: the pill is a
                  flex container, and a flex container's own text can be neither ellipsised nor
                  shrunk.

                  Both are hidden from the reader, because the button's label already says the
                  whole of it — "Plats C, ledig" — and the pair would otherwise be read a second
                  time after it. The same bargain the card in front of you strikes. */}
              <b aria-hidden="true">{s.id}</b>
              <span aria-hidden="true">{s.name ?? t('join.seat.free')}</span>
            </button>
          )
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void go(suggested, chosen)
        }}
      >
        {/* Etiketten står över fältet i stället för inuti det. En platshållare som lyder «Ditt
            namn» läses som ett ifyllt värde, och ett fält vars enda namn är ett `aria-label` har
            inget skrivet att peka på (WCAG 2.5.3, #416). */}
        <label className="byd-join-name">
          <span>{t('join.name')}</span>
          <input
            ref={field}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              // Villkoret gäller inte längre så snart något står i fältet.
              if (e.target.value.trim()) setSays(null)
            }}
            autoComplete="nickname"
            aria-required="true"
            aria-invalid={says ? 'true' : 'false'}
            {...(says ? { 'aria-describedby': saysId } : {})}
          />
        </label>
        {/* Villkoret, sagt en gång per skärm och vid fältet — inte en gång per knapp. Det föds
            efter trycket, så det föds som en levande region: en `alert` som kommer till
            dokumentet läses upp när den kommer, och fältet pekar på den. */}
        {says && (
          <p className="byd-join-says" id={saysId} role="alert" aria-live="assertive">
            {says}
          </p>
        )}
        {/* The seat she chose being taken is said where the refusal from the server is said: one
            paragraph at the control that is refused, in the picker rather than on a page of its
            own, because the thing to do next is choose another seat. */}
        {(lost || problem) && <p role="alert">{lost ? t('join.seat.taken') : problem}</p>}
        {/* Both ways in ask for the chosen seat, so a seat that has just been taken closes both.
            Disabled rather than removed: the control keeps its name and its place, so nothing
            moves under a thumb already on its way down, and a reader is told it is unavailable
            instead of finding it gone. Choosing again opens them. */}
        {/* While a way in is under way the pressed button says so and is `aria-disabled`, not
            `disabled`: it keeps its look and the focus, and the handler refuses the next press. */}
        {wide ? [here, sit] : [sit, here]}
        <button type="button" className="byd-join-observe byd-secondary" {...working(busy === '/observe')} onClick={() => void go('/observe', null)}>
          {t('join.observe')}
        </button>
      </form>
      </main>
      <RouteStatus status={live} over="sheet" links={links} onRetry={retry} />
    </div>
  )
}

// The form `/join` is without a code, and with one that names nothing (#675, A's form, which C
// took over): one field for the code, read as a code, and one button.
function CodeForm({ server, onOpen, typed, unknown }: { server: string | null; onOpen(url: string): void; typed?: string; unknown?: boolean }) {
  const t = useT()
  const { field, says, pressed, saysId, input, submit } = useCodeField({ id: 'byd-join-code', server, onOpen, ...(typed ? { typed } : {}), ...(unknown ? { unknown } : {}) })
  // The field is the whole of the page, so it has the focus from the start — and when the code in
  // it named nothing, the reader hears the field, the code and why, in that order.
  useEffect(() => field.current?.focus(), [field])
  // A code that names nothing is the phone's 404, an answer to something she asked for, so it is
  // said assertively in the page's own region (D5): the alert beside the field is drawn with the
  // page, and a region born with its text is a region nobody was listening to.
  const say = useSay()
  const sentence = unknown ? t('join.code.unknown') : null
  useEffect(() => {
    if (sentence) say?.('assertive', sentence)
  }, [say, sentence])
  return (
    <div className="byd-join-page">
      <main className="byd-join byd-join-code" data-page="join">
        <header>
          <h1>{t('join.code.title')}</h1>
        </header>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <p className="byd-join-lead">{t('join.code.lead')}</p>
          <label className="byd-join-name">
            <span>{t('join.code.label')}</span>
            <input ref={field} {...input} />
          </label>
          {says && (
            <p className="byd-code-says" id={saysId} {...(pressed ? { role: 'alert' } : {})}>
              {says}
            </p>
          )}
          <button type="submit" className="byd-primary">
            {t('join.code.go')}
          </button>
        </form>
      </main>
    </div>
  )
}

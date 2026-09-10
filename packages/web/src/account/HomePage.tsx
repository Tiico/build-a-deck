import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { LoginCard } from './LoginCard.js'
import { hue } from '../table/hue.js'
import { logout, myPlayed, myProjects, removeProject, startTable, whoAmI, type Played, type ProjectSummary } from './api.js'
import { seatColor } from '../table/seatColor.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { LanguagePicker, useLang, useT, type Lang, type T } from '../i18n/index.js'
import './account.css'

// /  — "Mina spel" (G1, prototype A): the account's projects as a grid of game cards, and a new
// one as a dashed card. Not logged in, the login card stands here instead.
export type HomePageProps = { onNavigate?(url: string): void }

export function HomePage({ onNavigate = (url) => location.assign(url) }: HomePageProps) {
  const t = useT()
  const { lang } = useLang()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [played, setPlayed] = useState<Played[] | null>(null)
  // Landing here from the claim page (G1): which session was just saved.
  const claimed = params.get('claimed')
  // The start page is where every other route's way home leads, so it is the last place that
  // may answer with a sentence written for a developer (#12). A page that could not be read at
  // all is one thing; an action that failed is another, and the second must never take the games
  // off the screen.
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  // A game's own menu (G1): which card has it open, which one is being asked about, and what the
  // last table started from here was, so the code can be read off.
  const [menu, setMenu] = useState<string | null>(null)
  const [asking, setAsking] = useState<ProjectSummary | null>(null)
  const [started, setStarted] = useState<{ project: string; code: string; id: string; hostKey: string } | null>(null)
  useEffect(() => {
    setOffline(false)
    void whoAmI(http)
      .then((e) => {
        setEmail(e)
        return e ? Promise.all([myProjects(http).then(setProjects), myPlayed(http).then(setPlayed)]) : undefined
      })
      .catch(() => setOffline(true))
  }, [http, attempt])
  // Logged out, `/` is the login card and the tab says so rather than promising games (#12).
  usePageTitle({ state: offline ? 'offline' : email === undefined ? 'loading' : null, route: email === null ? 'login' : null })
  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const justSaved = claimed ? played?.find((p) => p.session === claimed) : undefined
  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (email === undefined) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  if (email === null) {
    return (
      <div className="byd-account" data-page="home">
        <LoginCard http={http} next={location.pathname + location.search} onNavigate={onNavigate} />
      </div>
    )
  }
  return (
    <div className="byd-account byd-account-wide" data-page="home">
      <div className="byd-home">
        {justSaved && (
          <div className="byd-home-claimed" role="status">
            <span>
              {marked(t('home.claimed'), {
                game: <b>{justSaved.game ?? t('home.claimed.some-table')}</b>,
                name: <b>{justSaved.name}</b>,
              })}
            </span>
          </div>
        )}
        <header>
          <h1>{t('home.title')}</h1>
          <span className="byd-who">
            {email} ·{' '}
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault()
                void logout(http).then(() => setEmail(null))
              }}
            >
              {t('home.logout')}
            </a>{' '}
            ·{' '}
            <label className="byd-lang">
              {t('account.language')}
              <LanguagePicker />
            </label>
          </span>
        </header>
        {notice && (
          <p className="byd-home-notice" role="alert">
            {notice}
          </p>
        )}
        {started && (
          <div className="byd-home-started" role="status">
            {marked(t('home.started'), { code: <strong>{started.code}</strong> })}{' '}
            <a href={tableUrl(started.id, started.hostKey, server)} target="_blank" rel="noreferrer">
              {t('home.started.open')}
            </a>
          </div>
        )}
        {asking && (
          <div className="byd-home-asking" role="alertdialog" aria-label={t('home.remove.title')}>
            <span>{marked(t('home.remove.ask'), { name: <b>{asking.name}</b> })}</span>
            <button type="button" onClick={() => setAsking(null)}>{t('home.remove.keep')}</button>
            <button
              type="button"
              className="byd-home-remove"
              onClick={() => {
                const gone = asking
                setAsking(null)
                void removeProject(http, gone.id, t).then(
                  () => setProjects((list) => (list ?? []).filter((x) => x.id !== gone.id)),
                  (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
                )
              }}
            >
              {t('home.remove.confirm')}
            </button>
          </div>
        )}
        <div className="byd-home-grid" data-projects>
          {(projects ?? []).map((p) => (
            <div key={p.id} className="byd-home-game" data-project={p.id}>
              <a
                className="byd-home-open"
                href={`/editor?${suffix(new URLSearchParams({ project: p.id }))}`}
                onClick={(e) => {
                  e.preventDefault()
                  onNavigate(`/editor?${suffix(new URLSearchParams({ project: p.id }))}`)
                }}
              >
                <div className="byd-home-fan">
                  {[0, 1, 2, 3].map((i) => (
                    <i key={i} style={{ ['--hue' as string]: (hue(p.id) + i * 55) % 360 }} />
                  ))}
                </div>
                <strong>{p.name}</strong>
                <span className="byd-muted">{t('home.card.line', { rev: p.rev, played: playedLine(t, lang, p) })}</span>
              </a>
              <button type="button" className="byd-home-more" aria-label={t('home.menu.more', { name: p.name })} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
                ⋯
              </button>
              {menu === p.id && (
                <div className="byd-home-menu" role="group" aria-label={t('home.menu.label', { name: p.name })}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null)
                      void startTable(http, p.id, t).then(
                        (table) => {
                          setStarted({ project: p.id, ...table })
                          setProjects((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, tables: (x.tables ?? 0) + 1 } : x)))
                        },
                        (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
                      )
                    }}
                  >
                    {t('home.menu.start')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null)
                      setAsking(p)
                    }}
                  >
                    {t('home.menu.remove')}
                  </button>
                </div>
              )}
            </div>
          ))}
          <a className="byd-home-game" data-new href={`/new?${suffix(new URLSearchParams())}`} onClick={(e) => { e.preventDefault(); onNavigate(`/new?${suffix(new URLSearchParams())}`) }}>
            {t('home.new')}
          </a>
        </div>
        {played && played.length > 0 && (
          <>
            <h2 className="byd-home-h2">{t('home.played.title')}</h2>
            <div className="byd-home-grid" data-played-tables>
              {played.map((p) => (
                <div key={p.session} className="byd-home-game byd-home-played" data-played={p.session}>
                  <div className="byd-home-played-top">
                    <i className="byd-home-seat" style={{ ['--seat' as string]: p.seat === null ? '#7d8597' : seatColor(seatIndexOf(p.seat)) }}>{p.seat ?? '👁'}</i>
                    <span className="byd-muted">{when(t, lang, p.at)}</span>
                  </div>
                  <strong>{p.game ?? t('home.played.some-table')}</strong>
                  <span className="byd-muted">{t('home.played.you', { version: p.version, name: p.name })}</span>
                  <span className="byd-home-facts">
                    {p.ended ? (p.surveyed ? t('home.played.surveyed') : t('home.played.unsurveyed')) : t('home.played.running')}
                    {p.flags > 0 && ` · ${t('home.played.flags', { n: p.flags })}`}
                  </span>
                  {p.code && (
                    <a className="byd-home-action" href={`/join?${suffix(new URLSearchParams({ code: p.code }))}`} onClick={(e) => { e.preventDefault(); onNavigate(`/join?${suffix(new URLSearchParams({ code: p.code ?? '' }))}`) }}>
                      {t('home.played.back')}
                    </a>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// A sentence stays one sentence in the catalogue even when part of it is the reader's own — a
// game, a person, a room code. The catalogue holds the whole message; only the parts it names
// are handed over as nodes, so no language has to be glued together from halves.
function marked(message: string, parts: Record<string, ReactNode>): ReactNode[] {
  return message.split(/(\{\w+\})/).map((piece, i) => {
    const name = /^\{(\w+)\}$/.exec(piece)?.[1]
    return name && name in parts ? <Fragment key={i}>{parts[name]}</Fragment> : piece
  })
}

// What a game says about itself before it is opened (G1): how many tables it has, and when one
// was last played at. A game nobody has sat down to says so plainly.
function playedLine(t: T, lang: Lang, p: ProjectSummary): string {
  const tables = p.tables ?? 0
  if (tables === 0) return t('home.card.never')
  const at = p.lastPlayed ? t('home.card.last', { when: when(t, lang, p.lastPlayed) }) : t('home.card.nothing')
  return t(tables === 1 ? 'home.card.tables.one' : 'home.card.tables.other', { n: tables, at })
}

// The table's own screen, opened with the host key it was just handed (DRIFT §9).
function tableUrl(session: string, hostKey: string, server: string | null): string {
  const q = new URLSearchParams({ session, mode: 'tv', host: hostKey })
  if (server) q.set('server', server.replace(/^http/, 'ws'))
  return `/table?${q.toString()}`
}

// Seats are lettered from A; the colour follows the letter, as it does on the table.
const seatIndexOf = (seat: string): number => Math.max(0, seat.charCodeAt(0) - 65)
// When a table was sat at, in a word or two. A date older than a week is written the way the
// reader's own language writes dates.
function when(t: T, lang: Lang, iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
  if (days <= 0) return t('home.when.today')
  if (days === 1) return t('home.when.yesterday')
  if (days < 7) return t('home.when.days', { n: days })
  return new Date(iso).toLocaleDateString(lang === 'sv' ? 'sv-SE' : 'en-GB')
}

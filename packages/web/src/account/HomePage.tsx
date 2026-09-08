import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { hue } from '../table/hue.js'
import { logout, myPlayed, myProjects, whoAmI, type Played, type ProjectSummary } from './api.js'
import { seatColor } from '../table/seatColor.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import './account.css'

// /  — "Mina spel" (G1, prototype A): the account's projects as a grid of game cards, and a new
// one as a dashed card. Not logged in, the login card stands here instead.
export type HomePageProps = { onNavigate?(url: string): void }

export function HomePage({ onNavigate = (url) => location.assign(url) }: HomePageProps) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [played, setPlayed] = useState<Played[] | null>(null)
  // Landing here from the claim page (G1): which session was just saved.
  const claimed = params.get('claimed')
  // The start page is where every other route's way home leads, so it is the last place that
  // may answer with a sentence written for a developer (#12).
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setOffline(false)
    void whoAmI(http)
      .then((e) => {
        setEmail(e)
        return e ? Promise.all([myProjects(http).then(setProjects), myPlayed(http).then(setPlayed)]) : undefined
      })
      .catch(() => setOffline(true))
  }, [http, attempt])
  usePageTitle({ state: offline ? 'offline' : email === undefined ? 'loading' : null })
  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const justSaved = claimed ? played?.find((p) => p.session === claimed) : undefined
  if (offline) return <StatusNotice notice={noticeFor('offline', 'app')} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (email === undefined) return <StatusNotice notice={noticeFor('loading', 'app')} surface="page" />
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
            <span>Sparat: du spelade <b>{justSaved.game ?? 'ett bord'}</b> som <b>{justSaved.name}</b>. Enkäten och flaggorna hör nu till ditt konto.</span>
          </div>
        )}
        <header>
          <h1>Mina spel</h1>
          <span className="byd-who">
            {email} ·{' '}
            <a
              href="/login"
              onClick={(e) => {
                e.preventDefault()
                void logout(http).then(() => setEmail(null))
              }}
            >
              logga ut
            </a>
          </span>
        </header>
        <div className="byd-home-grid" data-projects>
          {(projects ?? []).map((p) => (
            <a key={p.id} className="byd-home-game" data-project={p.id} href={`/editor?${suffix(new URLSearchParams({ project: p.id }))}`} onClick={(e) => { e.preventDefault(); onNavigate(`/editor?${suffix(new URLSearchParams({ project: p.id }))}`) }}>
              <div className="byd-home-fan">
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} style={{ ['--hue' as string]: (hue(p.id) + i * 55) % 360 }} />
                ))}
              </div>
              <strong>{p.name}</strong>
              <span className="byd-muted">rev {p.rev}</span>
            </a>
          ))}
          <a className="byd-home-game" data-new href={`/new?${suffix(new URLSearchParams())}`} onClick={(e) => { e.preventDefault(); onNavigate(`/new?${suffix(new URLSearchParams())}`) }}>
            ＋ Nytt spel
          </a>
        </div>
        {played && played.length > 0 && (
          <>
            <h2 className="byd-home-h2">Bord du spelat vid</h2>
            <div className="byd-home-grid" data-played-tables>
              {played.map((p) => (
                <div key={p.session} className="byd-home-game byd-home-played" data-played={p.session}>
                  <div className="byd-home-played-top">
                    <i className="byd-home-seat" style={{ ['--seat' as string]: p.seat === null ? '#7d8597' : seatColor(seatIndexOf(p.seat)) }}>{p.seat ?? '👁'}</i>
                    <span className="byd-muted">{when(p.at)}</span>
                  </div>
                  <strong>{p.game ?? 'Ett bord'}</strong>
                  <span className="byd-muted">{p.version} · du var {p.name}</span>
                  <span className="byd-home-facts">
                    {p.ended ? (p.surveyed ? 'enkät besvarad' : 'enkät obesvarad') : 'pågår'}
                    {p.flags > 0 && ` · ${p.flags} flaggade`}
                  </span>
                  {p.code && (
                    <a className="byd-home-action" href={`/join?${suffix(new URLSearchParams({ code: p.code }))}`} onClick={(e) => { e.preventDefault(); onNavigate(`/join?${suffix(new URLSearchParams({ code: p.code ?? '' }))}`) }}>
                      Tillbaka till bordet
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

// Seats are lettered from A; the colour follows the letter, as it does on the table.
const seatIndexOf = (seat: string): number => Math.max(0, seat.charCodeAt(0) - 65)
// When a table was sat at, in a word or two.
function when(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86400_000)
  if (days <= 0) return 'i dag'
  if (days === 1) return 'i går'
  if (days < 7) return `för ${days} dagar sedan`
  return new Date(iso).toLocaleDateString('sv-SE')
}

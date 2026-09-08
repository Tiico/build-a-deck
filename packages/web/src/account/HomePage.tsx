import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { hue } from '../table/hue.js'
import { logout, myPlayed, myProjects, removeProject, startTable, whoAmI, type Played, type ProjectSummary } from './api.js'
import { seatColor } from '../table/seatColor.js'
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
  // A page that could not be read at all is one thing; an action that failed is another. The
  // second must never take the games off the screen.
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // A game's own menu (G1): which card has it open, which one is being asked about, and what the
  // last table started from here was, so the code can be read off.
  const [menu, setMenu] = useState<string | null>(null)
  const [asking, setAsking] = useState<ProjectSummary | null>(null)
  const [started, setStarted] = useState<{ project: string; code: string; id: string; hostKey: string } | null>(null)
  useEffect(() => {
    void whoAmI(http)
      .then((e) => {
        setEmail(e)
        return e ? Promise.all([myProjects(http).then(setProjects), myPlayed(http).then(setPlayed)]) : undefined
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }, [http])
  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
  const justSaved = claimed ? played?.find((p) => p.session === claimed) : undefined
  if (error) return <p role="alert">{error}</p>
  if (email === undefined) return <p>Laddar…</p>
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
        {notice && (
          <p className="byd-home-notice" role="alert">
            {notice}
          </p>
        )}
        {started && (
          <div className="byd-home-started" role="status">
            Bordet är igång. Rumskoden är <strong>{started.code}</strong>.{' '}
            <a href={tableUrl(started.id, started.hostKey, server)} target="_blank" rel="noreferrer">
              Öppna bordet
            </a>
          </div>
        )}
        {asking && (
          <div className="byd-home-asking" role="alertdialog" aria-label="Ta bort spelet">
            <span>
              Ta bort <b>{asking.name}</b>? Hela historien följer med, och det går inte att ångra.
            </span>
            <button type="button" onClick={() => setAsking(null)}>Behåll</button>
            <button
              type="button"
              className="byd-home-remove"
              onClick={() => {
                const gone = asking
                setAsking(null)
                void removeProject(http, gone.id).then(
                  () => setProjects((list) => (list ?? []).filter((x) => x.id !== gone.id)),
                  (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
                )
              }}
            >
              Ta bort
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
                <span className="byd-muted">rev {p.rev} · {playedLine(p)}</span>
              </a>
              <button type="button" className="byd-home-more" aria-label={`Fler val för ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)}>
                ⋯
              </button>
              {menu === p.id && (
                <div className="byd-home-menu" role="group" aria-label={`Val för ${p.name}`}>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null)
                      void startTable(http, p.id).then(
                        (t) => {
                          setStarted({ project: p.id, ...t })
                          setProjects((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, tables: (x.tables ?? 0) + 1 } : x)))
                        },
                        (err: unknown) => setNotice(err instanceof Error ? err.message : String(err)),
                      )
                    }}
                  >
                    Starta bord
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenu(null)
                      setAsking(p)
                    }}
                  >
                    Ta bort spelet
                  </button>
                </div>
              )}
            </div>
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

// What a game says about itself before it is opened (G1): how many tables it has, and when one
// was last played at. A game nobody has sat down to says so plainly.
function playedLine(p: ProjectSummary): string {
  const tables = p.tables ?? 0
  if (tables === 0) return 'aldrig spelat'
  const at = p.lastPlayed ? `senast ${when(p.lastPlayed)}` : 'inget spelat än'
  return `${tables} ${tables === 1 ? 'bord' : 'bord'} · ${at}`
}

// The table's own screen, opened with the host key it was just handed (DRIFT §9).
function tableUrl(session: string, hostKey: string, server: string | null): string {
  const q = new URLSearchParams({ session, mode: 'tv', host: hostKey })
  if (server) q.set('server', server.replace(/^http/, 'ws'))
  return `/table?${q.toString()}`
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

import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { hue } from '../table/hue.js'
import { logout, myProjects, whoAmI, type ProjectSummary } from './api.js'
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
  // The start page is where every other route's way home leads, so it is the last place that
  // may answer with a sentence written for a developer (#12).
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    setOffline(false)
    void whoAmI(http)
      .then((e) => {
        setEmail(e)
        return e ? myProjects(http).then(setProjects) : undefined
      })
      .catch(() => setOffline(true))
  }, [http, attempt])
  usePageTitle({ state: offline ? 'offline' : email === undefined ? 'loading' : null })
  const suffix = (q: URLSearchParams) => {
    if (server) q.set('server', server)
    return q.toString()
  }
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
      </div>
    </div>
  )
}

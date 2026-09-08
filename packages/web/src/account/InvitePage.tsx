import { useEffect, useState } from 'react'
import { acceptInvite, loginUrl } from './api.js'
import './account.css'

// /invites/:token — following an invitation to a game (D3). Whoever is signed in when they
// follow it joins in the role it names and lands in the editor; a link that has been used, or
// has run out, says so rather than pretending. Not signed in, the login card comes first and
// brings them back here.
export type InvitePageProps = { onNavigate?(url: string): void }

export function InvitePage({ onNavigate = (url) => location.assign(url) }: InvitePageProps) {
  const params = new URLSearchParams(location.search)
  const server = params.get('server')
  const http = server ?? location.origin
  const token = /^\/invites\/([^/?#]+)/.exec(location.pathname)?.[1] ?? ''
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void acceptInvite(http, decodeURIComponent(token)).then(
      (joined) => {
        if (!live) return
        if (joined === 'not-logged-in') {
          onNavigate(loginUrl(location.pathname + location.search, server))
          return
        }
        if (joined === 'spent') {
          setError('Den här inbjudan är använd eller har gått ut. Be den som bjöd in dig om en ny.')
          return
        }
        const q = new URLSearchParams({ project: joined.project })
        if (server) q.set('server', server)
        onNavigate(`/editor?${q.toString()}`)
      },
      (err: unknown) => live && setError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      live = false
    }
    // The token is the page: it cannot change while the page is open.
  }, [http, token, server, onNavigate])
  return (
    <div className="byd-account" data-page="invite">
      <div className="byd-login">
        <h1>Inbjudan</h1>
        {error ? (
          <p role="alert" className="byd-login-error">
            {error}
          </p>
        ) : (
          <p className="byd-muted">Öppnar spelet…</p>
        )}
      </div>
    </div>
  )
}

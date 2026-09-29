import { useEffect, useState } from 'react'
import { acceptInvite, loginUrl } from './api.js'
import { useT } from '../i18n/index.js'
import { noticeFor } from '../status/notice.js'
import { AccountStatus, spent, waiting } from './AccountStatus.js'

// /invites/:token — following an invitation to a game (D3). Whoever is signed in when they
// follow it joins in the role it names and lands in the editor; a link that has been used, or
// has run out, says so rather than pretending. Not signed in, the login card comes first and
// brings them back here.
export type InvitePageProps = { onNavigate?(url: string): void }

// The default is one function for the life of the module and not a fresh one per render: it is a
// dependency of the effect that follows the invitation, and a fresh one followed it again on every
// render (#475).
const go = (url: string): void => location.assign(url)

export function InvitePage({ onNavigate = go }: InvitePageProps) {
  const t = useT()
  const params = new URLSearchParams(location.search)
  const server = params.get('server')
  const http = server ?? location.origin
  const token = /^\/invites\/([^/?#]+)/.exec(location.pathname)?.[1] ?? ''
  // A used or lapsed invitation is an answer; a service that did not answer is worth asking again.
  const [problem, setProblem] = useState<'spent' | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setProblem(null)
    void acceptInvite(http, decodeURIComponent(token), t).then(
      (joined) => {
        if (!live) return
        if (joined === 'not-logged-in') {
          onNavigate(loginUrl(location.pathname + location.search, server))
          return
        }
        if (joined === 'spent') {
          setProblem('spent')
          return
        }
        const q = new URLSearchParams({ project: joined.project })
        if (server) q.set('server', server)
        onNavigate(`/editor?${q.toString()}`)
      },
      () => live && setProblem('offline'),
    )
    return () => {
      live = false
    }
    // The token is the page: it cannot change while the page is open, and the language the answer
    // is read in is no reason to follow the invitation a second time. Asking again after a lost
    // line is.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the token is the page; a new language is no reason to follow the invitation again
  }, [http, token, server, onNavigate, attempt])
  // Whoever reads anything here is signed in: without a login the page has already gone on to the
  // login card.
  const notice =
    problem === 'spent' ? spent(t('invite.spent.heading'), t('invite.spent'), t) : problem === 'offline' ? noticeFor('offline', 'app', t) : waiting(t('invite.opening'), t)
  return <AccountStatus page="invite" notice={notice} server={server} signedIn onRetry={() => setAttempt((n) => n + 1)} />
}

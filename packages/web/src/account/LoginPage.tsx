import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { invitedTo, whoAmI } from './api.js'
import { safeNext } from './next.js'
import { noticeFor } from '../status/notice.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useT } from '../i18n/index.js'
import './account.css'

// /login?next=/editor?project=…&server=http://…
//
// Whoever is already signed in is sent straight on to `next` (#475): the card would ask for an
// address the page already has, and a link that brought someone here on the way somewhere would
// stop at a form. It is a replace and not a step, so Back does not land on the form again.
export type LoginPageProps = { onNavigate?(url: string): void }

// One function for the life of the module, because it is a dependency of the effect that asks who
// is here, and a fresh one per render would ask again (#475).
const go = (url: string): void => location.replace(url)

export function LoginPage({ onNavigate = go }: LoginPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const http = params.get('server') ?? location.origin
  const next = safeNext(params.get('next'))
  const way = useMemo(() => wayIn(next), [next])
  // The game an invitation leads to is asked for beside who is here, and the card waits for both:
  // a line that gains a name after it has been read is a line that moved under the reader.
  const [known, setKnown] = useState<{ game: string | null } | null>(null)
  useEffect(() => {
    let live = true
    const game = way.kind === 'invite' ? invitedTo(http, way.token) : Promise.resolve(null)
    void whoAmI(http).then(
      async (email) => {
        if (!live) return
        if (email) return onNavigate(next)
        const name = await game
        if (live) setKnown({ game: name })
      },
      // A service that cannot say who is here can still be asked for a link; the card says so if
      // that fails too.
      async () => {
        const name = await game
        if (live) setKnown({ game: name })
      },
    )
    return () => {
      live = false
    }
  }, [http, next, way, onNavigate])
  if (!known) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  // One lead per way in (#691), as the claim has its own; a plain visit leaves the card its own.
  const lead =
    way.kind === 'invite'
      ? known.game
        ? t('login.lead.invite.named', { game: known.game })
        : t('login.lead.invite')
      : way.kind === 'resume'
        ? t('login.lead.resume')
        : undefined
  return (
    <main className="byd-account" data-page="login">
      <LoginCard http={http} next={next} lead={lead} />
    </main>
  )
}

// Where the login is on its way to says what it is for: following an invitation, or making the
// game the guide's draft is waiting to become (the `resume` mark `/new` sends it back with).
type WayIn = { kind: 'invite'; token: string } | { kind: 'resume' } | { kind: 'plain' }
function wayIn(next: string): WayIn {
  const url = new URL(next, 'http://next.invalid')
  const invite = /^\/invites\/([^/]+)$/.exec(url.pathname)
  if (invite?.[1]) return { kind: 'invite', token: decodeURIComponent(invite[1]) }
  if (url.pathname === '/new' && url.searchParams.get('resume') === '1') return { kind: 'resume' }
  return { kind: 'plain' }
}

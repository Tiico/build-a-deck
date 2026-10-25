import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { invitedTo } from './api.js'
import { whoAmI } from './session.js'
import { safeNext } from './next.js'
import { noticeFor } from '../status/notice.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { useT } from '../i18n/index.js'
import { ArrowGlyph } from '../glyphs.js'
import { isNewGame } from '../wizard/paths.js'
import './account.css'

// /login?next=/editor?project=…&server=http://…
//
// `step=name` is the welcome step after the first login (#1254, variant C): an account that is signed
// in is asked what the others should call it before it goes on to `next`. It is the login's own step,
// in the card's form, so it is drawn here rather than at an address of its own.
//
// Whoever is already signed in is sent straight on to `next` (#475): the card would ask for an
// address the page already has, and a link that brought someone here on the way somewhere would
// stop at a form. It is a replace and not a step, so Back does not land on the form again.
export type LoginPageProps = { onNavigate?(url: string): void }

// The welcome step travels in a chunk of its own: every route's dependencies are named in the entry
// the phone fetches too (#760), and the step is drawn once per account.
const WelcomePage = lazy(() => import('./WelcomePage.js').then((m) => ({ default: m.WelcomePage })))

// One function for the life of the module, because it is a dependency of the effect that asks who
// is here, and a fresh one per render would ask again (#475).
const go = (url: string): void => location.replace(url)

export function LoginPage({ onNavigate = go }: LoginPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const http = params.get('server') ?? location.origin
  // The page's own fragment belongs to where it goes on to (#1278): a guest's token on the way back
  // to her claim, which `loginUrl` put there rather than in the query.
  const next = safeNext(params.get('next')) + location.hash
  const way = useMemo(() => wayIn(next), [next])
  const naming = params.get('step') === 'name'
  // The game an invitation leads to is asked for beside who is here, and the card waits for both:
  // a line that gains a name after it has been read is a line that moved under the reader.
  const [known, setKnown] = useState<{ game: string | null; signedIn?: true } | null>(null)
  useEffect(() => {
    let live = true
    const game = way.kind === 'invite' ? invitedTo(http, way.token) : Promise.resolve(null)
    void whoAmI(http).then(
      async (email) => {
        if (!live) return
        if (email && naming) return setKnown({ game: null, signedIn: true })
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
  }, [http, next, way, naming, onNavigate])
  if (!known) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  if (known.signedIn) {
    return (
      <Suspense fallback={<StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />}>
        <WelcomePage onNavigate={onNavigate} />
      </Suspense>
    )
  }
  // One lead per way in (#691), as the claim has its own; a plain visit leaves the card its own.
  const lead =
    way.kind === 'invite'
      ? known.game
        ? t('login.lead.invite.named', { game: known.game })
        : t('login.lead.invite')
      : way.kind === 'resume'
        ? t('login.lead.resume')
        : undefined
  const server = params.get('server')
  const home = server ? `/?${new URLSearchParams({ server }).toString()}` : '/'
  return (
    <main className="byd-account" data-page="login">
      {/* The card goes on the way the page does, so a login it makes is not a step Back returns to. */}
      <LoginCard http={http} next={next} lead={lead} onNavigate={onNavigate} />
      {/* The page's way home (#1217): the start page, for whoever came here and is not staying. */}
      <a className="byd-account-home" href={home}>
        <ArrowGlyph to="left" />
        {t('status.act.home.start')}
      </a>
    </main>
  )
}

// Where the login is on its way to says what it is for: following an invitation, or making the
// game the guide's draft is waiting to become (the `resume` mark the crossroads or the guide sends
// it back with, L79).
type WayIn = { kind: 'invite'; token: string } | { kind: 'resume' } | { kind: 'plain' }
function wayIn(next: string): WayIn {
  const url = new URL(next, 'http://next.invalid')
  const invite = /^\/invites\/([^/]+)$/.exec(url.pathname)
  if (invite?.[1]) return { kind: 'invite', token: decodeURIComponent(invite[1]) }
  if (isNewGame(url.pathname) && url.searchParams.get('resume') === '1') return { kind: 'resume' }
  return { kind: 'plain' }
}

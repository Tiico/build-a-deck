import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { whoAmI } from './api.js'
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
  const [known, setKnown] = useState(false)
  useEffect(() => {
    let live = true
    void whoAmI(http).then(
      (email) => live && (email ? onNavigate(next) : setKnown(true)),
      // A service that cannot say who is here can still be asked for a link; the card says so if
      // that fails too.
      () => live && setKnown(true),
    )
    return () => {
      live = false
    }
  }, [http, next, onNavigate])
  if (!known) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  return (
    <main className="byd-account" data-page="login">
      <LoginCard http={http} next={next} />
    </main>
  )
}

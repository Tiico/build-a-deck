import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { claimGuest, whoAmI } from './session.js'
import { safeNext } from './next.js'
import { landingWith, takeGuestToken } from '../guestAddress.js'
import { useT } from '../i18n/index.js'
import { noticeFor } from '../status/notice.js'
import { AccountStatus, spent, waiting } from './AccountStatus.js'
import './account.css'

// /claim?next=…&server=…#token=…  — where the phone's "Spara till ditt konto" leads (G1). Without
// a login it is the login card with this page as the way back; with one the admission behind the
// token becomes the account's, and the guest goes back to `next` — the phone's thanks, which then
// say it is saved (#690). A link without one lands on the start page, which says so. The token is in
// the fragment (#1278) and goes back to `next` there, through the login too: the card's way back is
// this page with its fragment, and the sign-in mail keeps a fragment out of its query.
export type ClaimPageProps = { onNavigate?(url: string): void }

// One function for the life of the module, because it is a dependency of the effect that makes the
// claim, and a fresh one per render would make it again (#475). A replace and never a step, so
// Back from where the claim lands goes to the page before it rather than claiming again (#690).
const go = (url: string): void => location.replace(url)

export function ClaimPage({ onNavigate = go }: ClaimPageProps) {
  const t = useT()
  // The token first: an old link's query is cleaned before anything else reads it.
  const token = useMemo(() => takeGuestToken() ?? null, [])
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const next = params.get('next')
  const http = server ?? location.origin
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  // Why the claim did not go through: the link is not one, the table is someone else's, or the
  // service did not answer at all.
  const [problem, setProblem] = useState<'unknown' | 'other' | 'offline' | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setProblem(null)
    void whoAmI(http).then(
      (e) => live && setEmail(e),
      () => live && setProblem('offline'),
    )
    return () => {
      live = false
    }
  }, [http, attempt])
  useEffect(() => {
    if (!email || !token) return
    let live = true
    void claimGuest(http, token).then((r) => {
      if (!live) return
      if (r.ok) {
        if (next !== null && safeNext(next) === next) return onNavigate(landingWith(next, { saved: '1' }, location.hash))
        const q = new URLSearchParams({ claimed: r.session })
        if (server) q.set('server', server)
        onNavigate(`/?${q.toString()}`)
      } else if (r.reason === 'other') setProblem('other')
      else if (r.reason === 'unknown') setProblem('unknown')
      else setEmail(null)
    })
    return () => {
      live = false
    }
    // The claim itself must not be made again only because the page changed language, so the
    // language the messages are read in is deliberately not one of the reasons to run again.
  }, [email, token, http, server, next, onNavigate])

  const status = (notice: Parameters<typeof AccountStatus>[0]['notice'], onRetry?: () => void) => (
    <AccountStatus page="claim" notice={notice} server={server} signedIn={Boolean(email)} {...(onRetry ? { onRetry } : {})} />
  )
  if (!token) return status(spent(t('claim.failed.heading'), t('claim.no-token'), t))
  if (problem === 'offline') return status(noticeFor('offline', 'app', t), () => setAttempt((n) => n + 1))
  if (problem === 'unknown') return status(spent(t('claim.failed.heading'), t('claim.error.unknown'), t))
  if (problem === 'other') return status(spent(t('claim.taken.heading'), t('claim.error.other'), t))
  if (email === undefined) return status(noticeFor('loading', 'app', t))
  if (email === null) {
    // The card's way back is this very page, fragment and all. A browser sent to the address it
    // already stands on, with a fragment, does not load it again (#1278), so a login made here is
    // taken up here: the page asks again who is here, and the claim follows.
    const here = location.pathname + location.search + location.hash
    const back = (url: string) => (url === here ? setAttempt((n) => n + 1) : onNavigate(url))
    return (
      <main className="byd-account" data-page="claim">
        <LoginCard http={http} next={here} onNavigate={back} lead={t('claim.lead')} help={t('claim.help')} />
      </main>
    )
  }
  return status(waiting(t('claim.saving'), t))
}

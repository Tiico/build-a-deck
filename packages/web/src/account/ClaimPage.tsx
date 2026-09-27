import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { claimGuest, whoAmI } from './api.js'
import { useT } from '../i18n/index.js'
import { noticeFor } from '../status/notice.js'
import { AccountStatus, spent, waiting } from './AccountStatus.js'
import './account.css'

// /claim?token=…&server=…  — where the phone's "Spara till ditt konto" leads (G1). Without a
// login it is the login card with this page as the way back; with one the admission behind the
// token becomes the account's, and the start page says so.
export type ClaimPageProps = { onNavigate?(url: string): void }

export function ClaimPage({ onNavigate = (url) => location.assign(url) }: ClaimPageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const token = params.get('token')
  const server = params.get('server')
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
  }, [email, token, http, server, onNavigate])

  const status = (notice: Parameters<typeof AccountStatus>[0]['notice'], onRetry?: () => void) => (
    <AccountStatus page="claim" notice={notice} server={server} signedIn={Boolean(email)} {...(onRetry ? { onRetry } : {})} />
  )
  if (!token) return status(spent(t('claim.failed.heading'), t('claim.no-token'), t))
  if (problem === 'offline') return status(noticeFor('offline', 'app', t), () => setAttempt((n) => n + 1))
  if (problem === 'unknown') return status(spent(t('claim.failed.heading'), t('claim.error.unknown'), t))
  if (problem === 'other') return status(spent(t('claim.taken.heading'), t('claim.error.other'), t))
  if (email === undefined) return status(noticeFor('loading', 'app', t))
  if (email === null) {
    return (
      <div className="byd-account" data-page="claim">
        <LoginCard http={http} next={location.pathname + location.search} onNavigate={onNavigate} lead={t('claim.lead')} help={t('claim.help')} />
      </div>
    )
  }
  return status(waiting(t('claim.saving'), t))
}

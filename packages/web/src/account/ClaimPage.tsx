import { useEffect, useMemo, useState } from 'react'
import { LoginCard } from './LoginCard.js'
import { claimGuest, whoAmI } from './api.js'
import './account.css'

// /claim?token=…&server=…  — where the phone's "Spara till ditt konto" leads (G1). Without a
// login it is the login card with this page as the way back; with one the admission behind the
// token becomes the account's, and the start page says so.
export type ClaimPageProps = { onNavigate?(url: string): void }

export function ClaimPage({ onNavigate = (url) => location.assign(url) }: ClaimPageProps) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const token = params.get('token')
  const server = params.get('server')
  const http = server ?? location.origin
  const [email, setEmail] = useState<string | null | undefined>(undefined)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => {
    void whoAmI(http).then(setEmail).catch((err: unknown) => setProblem(err instanceof Error ? err.message : String(err)))
  }, [http])
  useEffect(() => {
    if (!email || !token) return
    void claimGuest(http, token).then((r) => {
      if (r.ok) {
        const q = new URLSearchParams({ claimed: r.session })
        if (server) q.set('server', server)
        onNavigate(`/?${q.toString()}`)
      } else if (r.reason === 'other') setProblem('Det här bordet är redan sparat till ett annat konto.')
      else if (r.reason === 'unknown') setProblem('Länken gäller inte. Gå tillbaka till telefonen och tryck på "Spara till ditt konto" igen.')
      else setEmail(null)
    })
  }, [email, token, http, server, onNavigate])

  if (!token) return <p>Ingen länk angiven.</p>
  if (problem) return <div className="byd-account" data-page="claim"><p role="alert" className="byd-login-error">{problem}</p></div>
  if (email === undefined) return <p>Laddar…</p>
  if (email === null) {
    return (
      <div className="byd-account" data-page="claim">
        <LoginCard http={http} next={location.pathname + location.search} onNavigate={onNavigate} lead="Logga in för att spara bordet du spelade vid till ditt konto." />
      </div>
    )
  }
  return <p>Sparar…</p>
}

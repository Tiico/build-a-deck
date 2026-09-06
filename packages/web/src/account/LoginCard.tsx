import { useState, type FormEvent } from 'react'
import { requestLink } from './api.js'

// Logging in (G1, prototype A): one field, one button, one sentence about guests. Never a
// password, never a word about whether the address is known.
export function LoginCard({ http, next, onNavigate = (url) => location.assign(url) }: { http: string; next: string; onNavigate?(url: string): void }) {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'open' | 'busy' | 'sent' | 'too-many' | 'invalid' | 'failed'>('open')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setState('busy')
    try {
      const result = await requestLink(http, email.trim(), next)
      if (result === 'logged-in') {
        onNavigate(next)
        return
      }
      setState(result)
    } catch {
      setState('failed')
    }
  }
  return (
    <div className="byd-login" data-login>
      <h1>build-your-deck</h1>
      <p className="byd-muted">Skapa ditt kortspel, speltesta det på skärmen, beställ hem det. Logga in för att komma till dina spel.</p>
      {state === 'sent' ? (
        <div className="byd-login-sent" role="status">
          <strong>Kolla mejlen.</strong>
          <span>Vi skickade en länk till {email.trim()}. Den fungerar i 15 minuter och bara en gång. Inget lösenord att komma ihåg.</span>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <input type="email" placeholder="din@epost.se" aria-label="E-post" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
          <button type="submit" disabled={state === 'busy' || !email.includes('@')}>
            Skicka inloggningslänk
          </button>
          {state === 'too-many' && <p className="byd-login-error" role="alert">Vi har redan skickat flera länkar till den adressen. Kolla mejlen, eller vänta en stund.</p>}
          {state === 'invalid' && <p className="byd-login-error" role="alert">Det där ser inte ut som en e-postadress.</p>}
          {state === 'failed' && <p className="byd-login-error" role="alert">Det gick inte att skicka. Försök igen.</p>}
          <p className="byd-muted">Inget lösenord. Länken i mejlet loggar in dig; första gången skapar den ditt konto.</p>
        </form>
      )}
      <p className="byd-muted">Ska du bara spela? Skanna QR-koden på bordet — inget konto behövs.</p>
    </div>
  )
}

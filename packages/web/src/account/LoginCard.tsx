import { useState, type FormEvent } from 'react'
import { requestLink } from './api.js'
import { LanguagePicker, useT } from '../i18n/index.js'

// Logging in (G1, prototype A): one field, one button, one sentence about guests. Never a
// password, never a word about whether the address is known.
// `lead` replaces the pitch line when the card is reached for one thing, like saving a session.
export function LoginCard({ http, next, onNavigate = (url) => location.assign(url), lead }: { http: string; next: string; onNavigate?(url: string): void; lead?: string | undefined }) {
  const t = useT()
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
      <p className="byd-muted">{lead ?? t('login.lead')}</p>
      {state === 'sent' ? (
        <div className="byd-login-sent" role="status">
          <strong>{t('login.sent.title')}</strong>
          <span>{t('login.sent.body', { email: email.trim() })}</span>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <input type="email" placeholder={t('login.email.placeholder')} aria-label={t('login.email')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
          <button type="submit" disabled={state === 'busy' || !email.includes('@')}>
            {t('login.submit')}
          </button>
          {state === 'too-many' && <p className="byd-login-error" role="alert">{t('login.error.too-many')}</p>}
          {state === 'invalid' && <p className="byd-login-error" role="alert">{t('login.error.invalid')}</p>}
          {state === 'failed' && <p className="byd-login-error" role="alert">{t('login.error.failed')}</p>}
          <p className="byd-muted">{t('login.no-password')}</p>
        </form>
      )}
      <p className="byd-muted">{t('login.guest')}</p>
      {/* The reader who cannot read this card is the one who most needs the switch on it. */}
      <label className="byd-lang">
        {t('account.language')}
        <LanguagePicker />
      </label>
    </div>
  )
}

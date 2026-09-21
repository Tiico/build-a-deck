import { useEffect, useState, type FormEvent } from 'react'
import { requestLink } from './api.js'
import { markPitchSeen, pitchSeen } from './pitch.js'
import { Help } from '../editor/HelpDrawer.js'
import { LanguagePicker, useT } from '../i18n/index.js'

// Logging in (G1, prototype A): one field, one button, one line about what logging in is for.
// Never a password, never a word about whether the address is known. The password-less link and
// the guest's way in are said behind the question mark (L32, L36), and the sales line stands the
// first time only (`pitch.ts`).
// `lead` replaces the line when the card is reached for one thing, like saving a session; a
// visitor who came for that one thing is not shown the pitch, and the visit is not counted as it.
export function LoginCard({ http, next, onNavigate = (url) => location.assign(url), lead, help }: { http: string; next: string; onNavigate?(url: string): void; lead?: string | undefined; help?: string | undefined }) {
  const t = useT()
  const [pitch] = useState(() => lead === undefined && !pitchSeen())
  useEffect(() => {
    if (pitch) markPitchSeen()
  }, [pitch])
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
      {pitch && <p className="byd-muted" data-pitch>{t('login.pitch')}</p>}
      <div className="byd-muted byd-help-row">
        <span>{lead ?? t('login.lead')}</span>
        <Help topic={t('login.help.topic')}>
          {help && <p>{help}</p>}
          <p>{t('login.pitch')}</p>
          <p>{t('login.no-password')}</p>
          <p>{t('login.guest')}</p>
        </Help>
      </div>
      {state === 'sent' ? (
        <div className="byd-login-sent" role="status">
          <strong>{t('login.sent.title')}</strong>
          <span>{t('login.sent.body', { email: email.trim() })}</span>
        </div>
      ) : (
        <form onSubmit={(e) => void submit(e)}>
          <input type="email" placeholder={t('login.email.placeholder')} aria-label={t('login.email')} value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus required />
          <button type="submit" className="byd-primary" disabled={state === 'busy' || !email.includes('@')}>
            {t('login.submit')}
          </button>
          {state === 'too-many' && <p className="byd-login-error" role="alert">{t('login.error.too-many')}</p>}
          {state === 'invalid' && <p className="byd-login-error" role="alert">{t('login.error.invalid')}</p>}
          {state === 'failed' && <p className="byd-login-error" role="alert">{t('login.error.failed')}</p>}
        </form>
      )}
      {/* The reader who cannot read this card is the one who most needs the switch on it. */}
      <label className="byd-lang">
        {t('account.language')}
        <LanguagePicker />
      </label>
    </div>
  )
}

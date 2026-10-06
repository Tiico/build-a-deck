import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { requestLink } from './api.js'
import { markPitchSeen, pitchSeen } from './pitch.js'
import { Help } from '../editor/HelpDrawer.js'
import { LanguagePicker, useT, type Key } from '../i18n/index.js'

// Logging in (G1, prototype A): one field, one button, one line about what logging in is for.
// Never a password, never a word about whether the address is known. The password-less link and
// the guest's way in are said behind the question mark (L32, L36), and the sales line stands the
// first time only (`pitch.ts`).
// `lead` replaces the line when the card is reached for one thing — saving a session, following an
// invitation, the guide's draft (#691); a visitor who came for that one thing is not shown the
// pitch, and the visit is not counted as it. The first visit has a line of its own: the same link
// logs in and makes the account, which the line for whoever comes back does not need to say.
export function LoginCard({ http, next, onNavigate = (url) => location.assign(url), lead, help }: { http: string; next: string; onNavigate?(url: string): void; lead?: string | undefined; help?: string | undefined }) {
  const t = useT()
  const [pitch] = useState(() => lead === undefined && !pitchSeen())
  useEffect(() => {
    if (pitch) markPitchSeen()
  }, [pitch])
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>('open')
  const field = useRef<HTMLInputElement>(null)
  // The sentence under the field is tied to it, and the field says it is the one at fault when it
  // is (#475). Both go the moment the address is edited: a sentence about the old address standing
  // under a new one is a sentence about nothing.
  const errorId = useId()
  const error = ERRORS[state] ?? null
  // The address is the one at fault for these, and not for a service that is busy or down.
  const faulty = state === 'empty' || state === 'at' || state === 'invalid'
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    // An address that is not one yet is said here, before the server is asked (#475): the button
    // used to be toned and Enter did nothing, so nobody was told what was missing. Said the way
    // the wizard says «Spelet behöver ett namn först», with the focus put back where the fix is.
    const address = email.trim()
    if (!address || !address.includes('@')) {
      setState(address ? 'at' : 'empty')
      field.current?.focus()
      return
    }
    setState('busy')
    try {
      const result = await requestLink(http, address, next)
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
      {/* The field and its button are under this row, and the box never lands on them (#726). */}
      <div className="byd-muted byd-help-row" data-help-explains=".byd-login form">
        <span>{lead ?? t(pitch ? 'login.lead.first' : 'login.lead')}</span>
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
        // The browser's own bubble is not the product's voice and says nothing a screen reader
        // keeps, so the card checks the address itself.
        <form noValidate onSubmit={(e) => void submit(e)}>
          {/* A visible name: the placeholder goes as soon as anything is typed, and the address being
              typed is exactly when a reader needs to know what the field is. The same form `/join`
              has (#416, #555). */}
          <label className="byd-login-email">
            <span>{t('login.email')}</span>
            <input
              ref={field}
              type="email"
              placeholder={t('login.email.placeholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (error) setState('open')
              }}
              autoComplete="email"
              autoFocus
              required
              {...(faulty ? { 'aria-invalid': true } : {})}
              {...(error ? { 'aria-describedby': errorId } : {})}
            />
          </label>
          <button type="submit" className="byd-primary" disabled={state === 'busy'}>
            {t('login.submit')}
          </button>
          {error && (
            <p id={errorId} className="byd-login-error" role="alert">
              {t(error)}
            </p>
          )}
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

type State = 'open' | 'busy' | 'sent' | 'empty' | 'at' | 'too-many' | 'invalid' | 'failed'
// What the card says under the field in each state that has something to say.
const ERRORS: Partial<Record<State, Key>> = {
  empty: 'login.error.empty',
  at: 'login.error.at',
  'too-many': 'login.error.too-many',
  invalid: 'login.error.invalid',
  failed: 'login.error.failed',
}

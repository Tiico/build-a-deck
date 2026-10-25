import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { DecksterMark } from '../brand/DecksterMark.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useT } from '../i18n/index.js'
import { loginUrl } from './session.js'
import { NAME_MAX, myAccount, saveName, suggestedName, type Me } from './api.js'
import { safeNext } from './next.js'
import { TermsStep } from './TermsStep.js'
import { Address } from './Address.js'
import { marked } from './marked.js'
import './account.css'

// /login?step=name&next=… — the step after the first link (#1254, beställarens beslut 2026-10-24, variant C),
// and after a passkey login for an account that has not been asked: what should the others call you?
// The name the address suggests is filled in, and the step is one press either way. «Hoppa över»
// keeps no name, and the question is never put again; the name can always be changed in Profil.
//
// It replaces itself in the history, as the claim's page does, so Back never lands on a question
// that has been answered.
//
// `step=terms` is the card's second step (#1272, beställarens beslut 2026-10-24, variant B): for an
// account that has not accepted the terms in force, the name is «Steg 1 av 2» and the terms are
// «Steg 2 av 2», in the same card, with «← Namnet» back to the first. The address says which step
// stands, so a reload opens the same one; the step only ever follows the name, and an account that
// was there before the terms meets them in a band on Mina spel instead.
export type WelcomePageProps = { onNavigate?(url: string): void }

export function WelcomePage({ onNavigate = (url) => location.replace(url) }: WelcomePageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  // The page's own fragment belongs to where it goes on to (#1278), as on the login page.
  const next = safeNext(params.get('next')) + location.hash
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [state, setState] = useState<'open' | 'busy' | 'failed'>('open')
  const [step, setStep] = useState<'name' | 'terms'>(() => (params.get('step') === 'terms' ? 'terms' : 'name'))
  // The step stands in the address, replaced and never pushed, so Back leaves the card altogether.
  const goTo = (to: 'name' | 'terms') => {
    const q = new URLSearchParams(location.search)
    q.set('step', to)
    history.replaceState(history.state, '', `${location.pathname}?${q.toString()}${location.hash}`)
    setState('open')
    setStep(to)
  }
  useEffect(() => {
    let live = true
    setOffline(false)
    void myAccount(http).then(
      (account) => {
        if (!live) return
        // Nobody signed in has nobody to name: the login, and back here after it. An account that has
        // answered goes on to where it was going, by the terms when it has them to accept.
        if (account === null) return onNavigate(loginUrl(next, server))
        if (step === 'terms' && !account.terms.due) return onNavigate(next)
        if (step === 'name' && account.asked) {
          if (!account.terms.due) return onNavigate(next)
          goTo('terms')
        }
        setName(account.name ?? (account.asked ? '' : (suggestedName(account.email) ?? '')))
        setMe(account)
      },
      () => live && setOffline(true),
    )
    return () => {
      live = false
    }
    // Asked once per attempt: the step is the answer to who is here when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [http, attempt])
  usePageTitle({ state: offline ? 'offline' : me === undefined ? 'loading' : null, part: t('welcome.tab') })

  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (!me) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />

  const answer = async (given: string | null) => {
    setState('busy')
    try {
      const saved = await saveName(http, given)
      if (saved === false) return setState('failed')
      if (!me.terms.due) return onNavigate(next)
      setMe({ ...me, name: saved.name, asked: true })
      goTo('terms')
    } catch {
      setState('failed')
    }
  }
  if (step === 'terms' && me.terms.current !== null) {
    return (
      <main className="byd-account" data-page="welcome">
        <TermsStep
          http={http}
          version={me.terms.current}
          title={t('terms.step.title')}
          step={{ n: 2, total: 2, onBack: () => goTo('name') }}
          focusOnOpen
          onAccepted={() => onNavigate(next)}
          onLater={() => onNavigate(next)}
        />
      </main>
    )
  }
  const go = (e: FormEvent) => {
    e.preventDefault()
    void answer(name.trim() === '' ? null : name)
  }
  const suggested = suggestedName(me.email) !== null
  return (
    <main className="byd-account" data-page="welcome">
      <div className="byd-login byd-welcome">
        <h1>
          <DecksterMark className="byd-login-mark" edge="#171a23" />
          {t('welcome.title')}
        </h1>
        {/* «Steg 1 av 2» when the terms follow the name (#1272, variant B). */}
        {me.terms.due && (
          <p className="byd-terms-steps">
            <i data-now="" />
            <i />
            <span>{t('terms.step.of', { n: 1, total: 2 })}</span>
          </p>
        )}
        <p className="byd-welcome-as">{marked(t('welcome.as'), { email: <Address email={me.email} /> })}</p>
        <form noValidate onSubmit={go}>
          <label className="byd-login-email">
            <span>{t('welcome.field')}</span>
            <input value={name} maxLength={NAME_MAX} placeholder={t('welcome.placeholder')} autoComplete="name" autoFocus onChange={(e) => setName(e.target.value)} {...(state === 'failed' ? { 'aria-invalid': true } : {})} />
          </label>
          <p className="byd-welcome-note">{[t('welcome.note'), suggested ? t('welcome.note.suggested') : null, t('welcome.note.profile')].filter(Boolean).join(' ')}</p>
          {state === 'failed' && (
            <p className="byd-login-error" role="alert">
              {t('welcome.failed')}
            </p>
          )}
          <div className="byd-welcome-answers">
            <button type="submit" className="byd-primary" disabled={state === 'busy'}>
              {t('welcome.go')}
            </button>
            <button type="button" className="byd-welcome-skip" disabled={state === 'busy'} onClick={() => void answer(null)}>
              {t('welcome.skip')}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

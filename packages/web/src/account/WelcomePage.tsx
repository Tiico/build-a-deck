import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { NAME_MAX, suggestedName } from '@byd/server/doc'
import { DecksterMark } from '../brand/DecksterMark.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { useT } from '../i18n/index.js'
import { loginUrl, myAccount, saveName, type Me } from './session.js'
import { safeNext } from './next.js'
import './account.css'

// /welcome?next=… — the step after the first link (#1254, beställarens beslut 2026-10-24, variant C),
// and after a passkey login for an account that has not been asked: what should the others call you?
// The name the address suggests is filled in, and the step is one press either way. «Hoppa över»
// keeps no name, and the question is never put again; the name can always be changed in Profil.
//
// It replaces itself in the history, as the claim's page does, so Back never lands on a question
// that has been answered.
export type WelcomePageProps = { onNavigate?(url: string): void }

export function WelcomePage({ onNavigate = (url) => location.replace(url) }: WelcomePageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const http = server ?? location.origin
  const next = safeNext(params.get('next'))
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [name, setName] = useState('')
  const [state, setState] = useState<'open' | 'busy' | 'failed'>('open')
  useEffect(() => {
    let live = true
    setOffline(false)
    void myAccount(http).then(
      (account) => {
        if (!live) return
        // Nobody signed in has nobody to name: the login, and back here after it. An account that has
        // answered goes on to where it was going.
        if (account === null) return onNavigate(loginUrl(`/welcome?${params.toString()}`, server))
        if (account.asked) return onNavigate(next)
        setName(suggestedName(account.email) ?? '')
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
  usePageTitle({ state: offline ? 'offline' : me === undefined ? 'loading' : null })

  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (!me) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />

  const answer = async (given: string | null) => {
    setState('busy')
    try {
      if ((await saveName(http, given)) === false) return setState('failed')
      onNavigate(next)
    } catch {
      setState('failed')
    }
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
        <p className="byd-welcome-as">{t('welcome.as', { email: me.email })}</p>
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

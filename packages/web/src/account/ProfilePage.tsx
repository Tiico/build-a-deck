import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { LoginCard } from './LoginCard.js'
import { AboutLine } from './AboutLine.js'
import { KeyBox, type WayBack } from './KeyBox.js'
import { PasskeyBox } from './PasskeyBox.js'
import { UsageCard } from './UsageCard.js'
import { myAccount, myProjects } from './api.js'
import { AccountCard } from './AccountCard.js'
import { NameCard } from './NameCard.js'
import { readAiKey, type AiKey } from './ai-key.js'
import { StatusNotice } from '../status/StatusNotice.js'
import { noticeFor } from '../status/notice.js'
import { usePageTitle } from '../status/DocumentTitle.js'
import { LanguagePicker, useT } from '../i18n/index.js'
import { ArrowGlyph, CheckGlyph } from '../glyphs.js'
import './account.css'
import './profile.css'

// /profile — the logged-in designer's own page (#999, #998 variant A): one column, the name first
// (#1254), then the AI key, the passkeys, what the account uses once a ceiling is set (#1198), the language and the account,
// which carries the account's extract and its deletion (#1280). An account has three things today, and one column is what three
// things need. The way in is a word in Mina spel's line, «e-post · Profil · logga ut», and the
// language picker moved here from that line.
//
// The editor sends a designer here with her game (`?from=<project>`), and then the way back names it
// and, once the key is saved, is the one filled button on the page.
export type ProfilePageProps = { onNavigate?(url: string): void }

type Loaded = { email: string; name: string | null; key: AiKey | null; game: { id: string; name: string } | null }

export function ProfilePage({ onNavigate = (url) => location.assign(url) }: ProfilePageProps) {
  const t = useT()
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const server = params.get('server')
  const from = params.get('from')
  const http = server ?? location.origin
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined)
  const [offline, setOffline] = useState(false)
  const [attempt, setAttempt] = useState(0)
  // The address of an account that has just deleted itself, for the door's one sentence (#1280).
  const [erased, setErased] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setOffline(false)
    void myAccount(http)
      .then(async (me) => {
        if (!me) return null
        // The game the editor sent her from is asked of her own list, so a game she may not open
        // names nothing, and a list that cannot be read only costs the way back its name.
        const [{ key }, game] = await Promise.all([readAiKey(http), from ? myProjects(http).then((list) => list.find((p) => p.id === from) ?? null, () => null) : null])
        return { email: me.email, name: me.name, key, game: game ? { id: game.id, name: game.name } : null }
      })
      .then(
        (state) => live && setLoaded(state),
        () => live && setOffline(true),
      )
    return () => {
      live = false
    }
  }, [http, from, attempt])
  usePageTitle({ state: offline ? 'offline' : loaded === undefined ? 'loading' : null, route: loaded === null ? 'login' : null })

  const withServer = (path: string, q: URLSearchParams) => {
    if (server) q.set('server', server)
    const query = q.toString()
    return query ? `${path}?${query}` : path
  }
  const go = (url: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    onNavigate(url)
  }

  if (offline) return <StatusNotice notice={noticeFor('offline', 'app', t)} surface="page" onRetry={() => setAttempt((n) => n + 1)} />
  if (loaded === undefined) return <StatusNotice notice={noticeFor('loading', 'app', t)} surface="page" />
  if (loaded === null || erased !== null) {
    // After «Ja, radera kontot» (#1280) she lands at the door, told what happened.
    const notice = erased === null ? undefined : (
      <p className="byd-login-done" role="status">
        <span className="byd-login-tick" aria-hidden="true">
          <CheckGlyph />
        </span>
        <span>
          <b>{t('login.erased.title')}</b> {t('login.erased.body', { email: erased })}
        </span>
      </p>
    )
    return (
      <main className="byd-account byd-account-door" data-page="profile">
        <LoginCard http={http} next={erased === null ? location.pathname + location.search : '/'} onNavigate={onNavigate} notice={notice} />
      </main>
    )
  }

  const game = loaded.game
  const back = game ? withServer('/editor', new URLSearchParams({ project: game.id })) : withServer('/', new URLSearchParams())
  const wayBack: WayBack | null = game ? { href: back, name: game.name, onGo: go(back) } : null
  return (
    <main className="byd-account byd-account-wide" data-page="profile">
      <div className="byd-profile">
        <a className="byd-profile-back" href={back} onClick={go(back)}>
          <ArrowGlyph to="left" />
          {game ? t('profile.back.game', { game: game.name }) : t('profile.back.home')}
        </a>
        <header className="byd-profile-head">
          <h1>{t('profile.title')}</h1>
          <p className="byd-muted">{loaded.email}</p>
        </header>
        {/* What the others call her (#1254), first: it is the one thing here other people read. */}
        <NameCard http={http} email={loaded.email} initial={loaded.name} />
        <KeyBox http={http} initial={loaded.key} wayBack={wayBack} />
        <PasskeyBox http={http} />
        {/* What the account uses (#1198, variant A), only once a ceiling is set. */}
        <UsageCard http={http} />
        <section className="byd-profile-card" aria-labelledby="byd-profile-lang">
          <h2 id="byd-profile-lang">{t('profile.lang.title')}</h2>
          <div className="byd-profile-field">
            <label htmlFor="byd-profile-lang-pick">{t('profile.lang.field')}</label>
            <LanguagePicker id="byd-profile-lang-pick" named={t('profile.lang.field')} />
          </div>
          <p className="byd-profile-quiet byd-profile-small">{t('profile.lang.note')}</p>
        </section>
        {/* The account itself, and its two rights (#1280): the extract and the deletion. */}
        <AccountCard http={http} email={loaded.email} onLoggedOut={() => setLoaded(null)} onErased={() => setErased(loaded.email)} />
        <AboutLine http={http} />
      </div>
    </main>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { canShare, ROLES, roleWord, type Role } from '@byd/server/doc'
import { inviteToProject, projectMembers, unshareProject, waitingInvites, withdrawInvite, type Member, type WaitingInvite } from '../account/api.js'
import type { Presence } from '@byd/server'
import { useLang, useT } from '../i18n/index.js'
import { saidOr } from '../i18n/said.js'
import { Help } from './HelpDrawer.js'
import { Question } from './Question.js'

// Who has the game (D3), from the prototype: the people in the editor's header are the door.
// Who is here now and who may be here at all is one question, so one list answers it — the
// ones present first, each with what they may do, and a field to invite one more.
//
// The address being written is the editor's to hold (`draft`), so a panel closed with Escape half
// way through an address gives it back when it opens again (#477).
//
// `role` is what the one looking may do (D3, #689): inviting and taking the game back are the
// owner's, so anyone else is shown who has it and told who can share it, not offered a form the
// server would refuse. A panel that is not told is the owner's, as the editor was before roles.
export type SharePanelProps = { http: string; project: string; here: readonly Presence[]; onClose(): void; draft?: string; onDraft?(email: string): void; role?: Role | null }

export function SharePanel({ http, project, here, onClose, draft = '', onDraft, role: mine = null }: SharePanelProps) {
  const t = useT()
  const sharing = mine === null || canShare(mine)
  // What a role is called is the tool's word, and the server keeps that word — it is the same
  // one an invitation is written with (A4).
  const { lang } = useLang()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [email, setEmailHere] = useState(draft)
  const setEmail = (next: string) => {
    setEmailHere(next)
    onDraft?.(next)
  }
  // Who is about to have the game taken from them (#477): asked about before it happens.
  const [asking, setAsking] = useState<string | null>(null)
  // The panel takes the keyboard with it when it opens, as the help box does (L32), and keeps it
  // when a row it was standing on goes.
  const cross = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    cross.current?.focus()
  }, [])
  const [role, setRole] = useState<Role>('editor')
  const [asked, setAsked] = useState(0)
  // What is waiting (beslut 2026-09-27, #477 fynd 10, variant C): a line by the form, folded.
  const [waiting, setWaiting] = useState<WaitingInvite[]>([])
  const [showWaiting, setShowWaiting] = useState(false)
  const [waited, setWaited] = useState(0)
  const waitingRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    let live = true
    waitingInvites(http, project, t).then(
      (w) => live && setWaiting(w),
      () => undefined,
    )
    return () => {
      live = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new language is no reason to ask for the invitations again
  }, [http, project, waited])
  useEffect(() => {
    let live = true
    projectMembers(http, project, t).then(
      (m) => live && setMembers(m),
      // Said in a sentence for what was tried, never in the network's or the server's own words
      // (#812, A4); a reason the client knew is said as it said it.
      (err: unknown) => live && setError(saidOr(err, t('error.members.failed'))),
    )
    return () => {
      live = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- a new language is no reason to ask for the members again
  }, [http, project, asked])

  const present = new Set(here.map((p) => p.name))
  const sorted = [...(members ?? [])].sort((a, b) => Number(present.has(b.email)) - Number(present.has(a.email)))
  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    // The app's own words rather than the browser's bubble, and the same place every other
    // answer stands (#477).
    if (!/^[^\s@]+@[^\s@]+$/.test(email.trim())) {
      setSent(null)
      return setError(t('error.invite.address'))
    }
    try {
      await inviteToProject(http, project, email.trim(), role, t)
      setSent(email.trim())
      setEmail('')
      setError(null)
      setWaited((n) => n + 1)
    } catch (err) {
      setSent(null)
      setError(saidOr(err, t('error.invite.failed')))
    }
  }
  const withdraw = async (who: string) => {
    try {
      await withdrawInvite(http, project, who, t)
      setWaiting((w) => w.filter((x) => x.email !== who))
      setError(null)
      setWaited((n) => n + 1)
      // The row and its button are gone; the keyboard goes back to the line it was opened from.
      ;(waitingRef.current ?? field.current)?.focus()
    } catch (err) {
      setError(saidOr(err, t('error.withdraw.failed', { email: who })))
    }
  }
  const drop = async (who: string) => {
    try {
      await unshareProject(http, project, who, t)
      setMembers((m) => (m ?? []).filter((x) => x.email !== who))
      setError(null)
      // The row and its button are gone; the keyboard goes on to the address field.
      field.current?.focus()
    } catch (err) {
      setError(saidOr(err, t('error.unshare.failed', { email: who })))
    }
  }
  return (
    <div className="byd-share" role="dialog" aria-label={t('share.title')}>
      <header>
        <h2>{t('share.title')}</h2>
        <Help topic={t('share.help.topic')}>
          <p>{t('share.help')}</p>
        </Help>
        <button ref={cross} type="button" aria-label={t('share.close')} onClick={onClose}>
          ×
        </button>
      </header>
      {error && <p role="alert">{error}</p>}
      {!members ? (
        <p>{t('share.reading')}</p>
      ) : (
        <ul>
          {sorted.map((m) => (
            <li key={m.email} data-member={m.email} {...(present.has(m.email) ? { 'data-here': 'true' } : {})}>
              <i style={{ ['--who' as string]: colourOf(m.email) }}>{m.email.slice(0, 1).toUpperCase()}</i>
              <span>
                <b>{m.email}</b>
                <small>
                  {roleWord(m.role, lang)}
                  {present.has(m.email) ? ` · ${t('share.hereNow')}` : ''}
                </small>
              </span>
              {sharing && m.role !== 'owner' && (
                <button type="button" aria-label={t('share.remove.of', { email: m.email })} onClick={() => setAsking(m.email)}>
                  {t('share.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {asking && (
        <Question
          className="byd-share-question"
          label={t('share.remove.ask', { email: asking })}
          confirm={t('share.remove.yes')}
          onConfirm={() => {
            setAsking(null)
            void drop(asking)
          }}
          onCancel={() => {
            setAsking(null)
            field.current?.focus()
          }}
        >
          {t('share.remove.ask', { email: asking })}
        </Question>
      )}
      {!sharing && <p>{t('share.ownerOnly')}</p>}
      {sharing && (
        <form noValidate onSubmit={(e) => void invite(e)}>
          <input ref={field} type="email" aria-label={t('share.email')} placeholder={t('share.email.placeholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
          <select aria-label={t('share.role')} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.filter((r) => r !== 'owner').map((r) => (
              <option key={r} value={r}>
                {roleWord(r, lang)}
              </option>
            ))}
          </select>
          <button type="submit">{t('share.invite')}</button>
          {sent && (
            <p role="status" onAnimationEnd={() => setAsked((n) => n + 1)}>
              {t('share.sent', { email: sent })}
            </p>
          )}
        </form>
      )}
      {waiting.length > 0 && (
        <div className="byd-share-waiting">
          <button ref={waitingRef} type="button" aria-expanded={showWaiting} onClick={() => setShowWaiting((on) => !on)}>
            {t(waiting.length === 1 ? 'share.waiting.one' : 'share.waiting.other', { n: waiting.length })}
            <span aria-hidden="true">{showWaiting ? '▾' : '▸'}</span>
          </button>
          {showWaiting && (
            <ul>
              {waiting.map((w) => (
                <li key={w.email} data-waiting={w.email}>
                  <span>
                    <b>{w.email}</b>
                    <small>{t('share.waiting.as', { role: roleWord(w.role, lang), days: Math.max(1, Math.ceil((Date.parse(w.expiresAt) - Date.now()) / 86_400_000)) })}</small>
                  </span>
                  <button type="button" aria-label={t('share.withdraw.of', { email: w.email })} onClick={() => void withdraw(w.email)}>
                    {t('share.withdraw')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// A colour per person, from their address, so the same face keeps its colour.
export function colourOf(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 55%)`
}

import { useEffect, useState } from 'react'
import { ROLES, roleWord, type Role } from '@byd/server/doc'
import { inviteToProject, projectMembers, unshareProject, type Member } from '../account/api.js'
import type { Presence } from '@byd/server'
import { useLang, useT } from '../i18n/index.js'

// Who has the game (D3), from the prototype: the people in the editor's header are the door.
// Who is here now and who may be here at all is one question, so one list answers it — the
// ones present first, each with what they may do, and a field to invite one more.
export type SharePanelProps = { http: string; project: string; here: readonly Presence[]; onClose(): void }

export function SharePanel({ http, project, here, onClose }: SharePanelProps) {
  const t = useT()
  // What a role is called is the tool's word, and the server keeps that word — it is the same
  // one an invitation is written with (A4).
  const { lang } = useLang()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    let live = true
    projectMembers(http, project, t).then(
      (m) => live && setMembers(m),
      (err: unknown) => live && setError(err instanceof Error ? err.message : String(err)),
    )
    return () => {
      live = false
    }
  }, [http, project, asked])

  const present = new Set(here.map((p) => p.name))
  const sorted = [...(members ?? [])].sort((a, b) => Number(present.has(b.email)) - Number(present.has(a.email)))
  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) return
    try {
      await inviteToProject(http, project, email, role, t)
      setSent(email)
      setEmail('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const drop = async (who: string) => {
    try {
      await unshareProject(http, project, who, t)
      setMembers((m) => (m ?? []).filter((x) => x.email !== who))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="byd-share" role="dialog" aria-label={t('share.title')}>
      <header>
        <h2>{t('share.title')}</h2>
        <button type="button" aria-label={t('share.close')} onClick={onClose}>
          ×
        </button>
      </header>
      <p>{t('share.lead')}</p>
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
              {m.role !== 'owner' && (
                <button type="button" aria-label={t('share.remove.of', { email: m.email })} onClick={() => void drop(m.email)}>
                  {t('share.remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void invite(e)}>
        <input type="email" aria-label={t('share.email')} placeholder={t('share.email.placeholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
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
    </div>
  )
}

// A colour per person, from their address, so the same face keeps its colour.
export function colourOf(seed: string): string {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) % 360
  return `hsl(${h} 55% 55%)`
}

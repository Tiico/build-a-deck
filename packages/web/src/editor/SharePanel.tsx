import { useEffect, useState } from 'react'
import { ROLES, roleWord, type Role } from '@byd/server/doc'
import { inviteToProject, projectMembers, unshareProject, type Member } from '../account/api.js'
import type { Presence } from '@byd/server'

// Who has the game (D3), from the prototype: the people in the editor's header are the door.
// Who is here now and who may be here at all is one question, so one list answers it — the
// ones present first, each with what they may do, and a field to invite one more.
export type SharePanelProps = { http: string; project: string; here: readonly Presence[]; onClose(): void }

export function SharePanel({ http, project, here, onClose }: SharePanelProps) {
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('editor')
  const [asked, setAsked] = useState(0)
  useEffect(() => {
    let live = true
    projectMembers(http, project).then(
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
      await inviteToProject(http, project, email, role)
      setSent(email)
      setEmail('')
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  const drop = async (who: string) => {
    try {
      await unshareProject(http, project, who)
      setMembers((m) => (m ?? []).filter((x) => x.email !== who))
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }
  return (
    <div className="byd-share" role="dialog" aria-label="Vilka som har spelet">
      <header>
        <h2>Vilka som har spelet</h2>
        <button type="button" aria-label="Stäng" onClick={onClose}>
          ×
        </button>
      </header>
      <p>De som är inne nu står överst. Samma lista säger vem som får vara med.</p>
      {error && <p role="alert">{error}</p>}
      {!members ? (
        <p>Läser…</p>
      ) : (
        <ul>
          {sorted.map((m) => (
            <li key={m.email} data-member={m.email} {...(present.has(m.email) ? { 'data-here': 'true' } : {})}>
              <i style={{ ['--who' as string]: colourOf(m.email) }}>{m.email.slice(0, 1).toUpperCase()}</i>
              <span>
                <b>{m.email}</b>
                <small>
                  {roleWord(m.role)}
                  {present.has(m.email) ? ' · inne nu' : ''}
                </small>
              </span>
              {m.role !== 'owner' && (
                <button type="button" aria-label={`Ta bort ${m.email}`} onClick={() => void drop(m.email)}>
                  Ta bort
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(e) => void invite(e)}>
        <input type="email" aria-label="Adress att bjuda in" placeholder="namn@exempel.se" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select aria-label="Roll" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {ROLES.filter((r) => r !== 'owner').map((r) => (
            <option key={r} value={r}>
              {roleWord(r)}
            </option>
          ))}
        </select>
        <button type="submit">Bjud in</button>
        {sent && (
          <p role="status" onAnimationEnd={() => setAsked((n) => n + 1)}>
            Inbjudan är skickad till {sent}. Den lever en vecka och går att använda en gång.
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

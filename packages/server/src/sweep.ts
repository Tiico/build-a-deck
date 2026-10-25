import type { AuthStore } from './auth.js'
import type { ProjectStore } from './projects.js'
import { GUEST_PENDING_TTL_MS } from './rooms.js'
import type { LogStore } from './store.js'

// What can no longer be used is swept (#1277, G6, F4): login links that are spent or ran out,
// sessions that ran out, invitations `INVITE_KEEP_MS` after they were used or ran out unused, and
// admissions never opened before their wait was over. Each of them holds an address, a name or a
// hash and answers nothing any more. What a table remembers — an opened, a kicked or a claimed
// admission — is the erasure's (#1279), not this.
//
// The sweeper in `main.ts` runs it at start and every hour; its line says how many rows went from
// each table and never which (DRIFT §8).

// G6: an invitation is gone thirty days after it was used or ran out. The box may say fewer days
// in `INVITE_KEEP_MS` and never more, since a longer keep would be past what was decided.
export const INVITE_KEEP_MS = 30 * 24 * 3600_000

export function inviteKeepFrom(env: Record<string, string | undefined>): number {
  const raw = env['INVITE_KEEP_MS']
  if (raw === undefined || raw.trim() === '') return INVITE_KEEP_MS
  const ms = Number(raw)
  if (!Number.isInteger(ms) || ms < 0) throw new Error(`INVITE_KEEP_MS is not a whole number of milliseconds: ${raw}`)
  return Math.min(ms, INVITE_KEEP_MS)
}

export type Sweepable = { auth?: AuthStore | null; projects?: ProjectStore | null; store: LogStore }
export type Swept = { login_tokens: number; auth_sessions: number; project_invites: number; guest_tokens: number }

export async function sweepSpent(stores: Sweepable, now: Date, inviteKeepMs: number = INVITE_KEEP_MS): Promise<Swept> {
  const at = now.toISOString()
  const auth = stores.auth ? await stores.auth.sweepSpent(at) : { loginTokens: 0, sessions: 0 }
  const swept: Swept = {
    login_tokens: auth.loginTokens,
    auth_sessions: auth.sessions,
    project_invites: stores.projects ? await stores.projects.sweepInvites(new Date(now.getTime() - inviteKeepMs).toISOString()) : 0,
    guest_tokens: await stores.store.sweepGuests(at, GUEST_PENDING_TTL_MS),
  }
  console.log(JSON.stringify({ msg: 'swept', ...swept }))
  return swept
}

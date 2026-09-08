// The creator's account (G1, DRIFT §11) from the browser's side: a magic link by mail, a cookie
// the browser keeps, and the projects that belong to the account. `http` is the server origin;
// in development it is another port, so credentials are sent explicitly.
import type { Role } from '@byd/server/doc'
import { translate, type T } from '../i18n/index.js'

// What went wrong is said to the reader, in their language (A4). A caller that has no `t` — a
// test, a surface mounted on its own — gets Swedish, the catalogue's own language.
const swedish: T = (key, params) => translate('sv', key, params)

export class Unauthorized extends Error {
  constructor() {
    super('not logged in')
    this.name = 'Unauthorized'
  }
}

export const withCredentials = (init: RequestInit = {}): RequestInit => ({ ...init, credentials: 'include' })

// What the tool writes back — a sign-in link, an invitation — should reach the reader in the
// language they are reading in (A4). The page already says which language it is in, because
// assistive technology needs that; asking the page is one source rather than a second one
// threaded through every call.
const pageLang = (): { lang?: string } => {
  const lang = typeof document === 'undefined' ? '' : document.documentElement.lang
  return lang ? { lang } : {}
}

export async function requestLink(http: string, email: string, next: string): Promise<'sent' | 'logged-in' | 'too-many' | 'invalid'> {
  const res = await fetch(`${http}/auth/login`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, next, ...pageLang() }) }))
  if (res.status === 429) return 'too-many'
  if (res.status === 400) return 'invalid'
  if (!res.ok) throw new Error(`could not ask for a link: ${res.status}`)
  const body = (await res.json()) as { loggedIn?: boolean }
  return body.loggedIn ? 'logged-in' : 'sent'
}

export async function whoAmI(http: string): Promise<string | null> {
  const res = await fetch(`${http}/auth/me`, withCredentials())
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`could not read the account: ${res.status}`)
  return ((await res.json()) as { email: string }).email
}

export async function logout(http: string): Promise<void> {
  await fetch(`${http}/auth/logout`, withCredentials({ method: 'POST' }))
}

// A game as "Mina spel" lists it (G1): where its history stands, how many tables it has, and
// when one of them was last played at.
export type ProjectSummary = { id: string; name: string; rev: number; tables?: number; lastPlayed?: string | null }
export async function myProjects(http: string): Promise<ProjectSummary[]> {
  const res = await fetch(`${http}/projects`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not list projects: ${res.status}`)
  return (await res.json()) as ProjectSummary[]
}

// Sharing a game (D3): who it is shared with, an invitation to an address, and taking it back.
export type Member = { email: string; role: Role }
export async function projectMembers(http: string, project: string, t: T = swedish): Promise<Member[]> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/members`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(t('error.members.failed', { status: res.status }))
  return (await res.json()) as Member[]
}

export async function inviteToProject(http: string, project: string, email: string, role: Role, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/invites`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role, ...pageLang() }) }))
  if (res.status === 401) throw new Unauthorized()
  if (res.status === 403) throw new Error(t('error.invite.notOwner'))
  if (!res.ok) throw new Error(t('error.invite.failed', { status: res.status }))
}

export async function unshareProject(http: string, project: string, email: string, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/members/${encodeURIComponent(email)}`, withCredentials({ method: 'DELETE' }))
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(t('error.unshare.failed', { status: res.status }))
}

// Following an invitation: 'not-logged-in' asks for a login first, 'spent' means it is gone.
export async function acceptInvite(http: string, token: string, t: T = swedish): Promise<{ project: string; role: Role } | 'not-logged-in' | 'spent'> {
  const res = await fetch(`${http}/invites/${encodeURIComponent(token)}`, withCredentials({ method: 'POST' }))
  if (res.status === 401) return 'not-logged-in'
  if (res.status === 404) return 'spent'
  if (!res.ok) throw new Error(t('error.join.failed', { status: res.status }))
  return (await res.json()) as { project: string; role: Role }
}

// Starting a table from the home page (G1): the same session the editor starts, so the code and
// the host key come from the server and nowhere else.
export async function startTable(http: string, project: string, t: T = swedish): Promise<{ id: string; code: string; hostKey: string }> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/sessions`, withCredentials({ method: 'POST' }))
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(t('error.startTable.failed', { status: res.status }))
  return (await res.json()) as { id: string; code: string; hostKey: string }
}

// Taking a game away (G1): its whole history goes with it, so the page asks first.
export async function removeProject(http: string, project: string, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}`, withCredentials({ method: 'DELETE' }))
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(t('error.removeGame.failed', { status: res.status }))
}

// A guest session claimed to the account afterwards (G1), and the tables the account sat at.
export type Played = { session: string; seat: string | null; name: string; kind: 'seat' | 'observer'; at: string; game: string | null; version: string; ended: boolean; surveyed: boolean; flags: number; code?: string }
export async function claimGuest(http: string, token: string): Promise<{ ok: true; session: string; seat: string | null; name: string } | { ok: false; reason: 'not-logged-in' | 'unknown' | 'other' }> {
  const res = await fetch(`${http}/guests/claim`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }))
  if (res.status === 401) return { ok: false, reason: 'not-logged-in' }
  if (res.status === 404) return { ok: false, reason: 'unknown' }
  if (res.status === 409) return { ok: false, reason: 'other' }
  if (!res.ok) throw new Error(`could not claim: ${res.status}`)
  return { ok: true, ...((await res.json()) as { session: string; seat: string | null; name: string }) }
}
export async function myPlayed(http: string): Promise<Played[]> {
  const res = await fetch(`${http}/me/played`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not list played tables: ${res.status}`)
  return (await res.json()) as Played[]
}

// The phone's way to save a session (G1): the claim page, which asks for a login first when
// there is none. The phone names its server as a WebSocket origin; the account pages speak HTTP.
export function claimUrl(token: string, server: string | null): string {
  const claim = new URLSearchParams({ token })
  if (server) claim.set('server', server.replace(/^ws/, 'http'))
  return `/claim?${claim.toString()}`
}

// Where to log in from a page, and come back to it after.
export function loginUrl(next: string, server: string | null): string {
  const q = new URLSearchParams({ next })
  if (server) q.set('server', server)
  return `/login?${q.toString()}`
}

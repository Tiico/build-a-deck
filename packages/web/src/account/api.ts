// The creator's account (G1, DRIFT §11) from the browser's side: a magic link by mail, a cookie
// the browser keeps, and the projects that belong to the account. `http` is the server origin;
// in development it is another port, so credentials are sent explicitly.
import type { CardFace, CardPeek, Role } from '@byd/server/doc'
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
  if (!res.ok) throw new Error(`could not read the account: ${res.status}`)
  // Nobody logged in is `null` in a 200 (#744), never a 401 the browser would log as an error.
  return ((await res.json()) as { email: string | null }).email
}

export async function logout(http: string): Promise<void> {
  await fetch(`${http}/auth/logout`, withCredentials({ method: 'POST' }))
}

// A game as "Mina spel" lists it (G1): where its history stands, how many tables it has, when one
// of them was last played at, and which of its own cards stands on it (#231) — `null` for a game
// with no cards yet, which is the tile's deliberate empty state.
export type ProjectSummary = { id: string; name: string; rev: number; tables?: number; lastPlayed?: string | null; card?: CardPeek | null; role?: 'owner' | 'editor' | 'tester' | 'viewer' }
export async function myProjects(http: string): Promise<ProjectSummary[]> {
  const res = await fetch(`${http}/projects`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not list projects: ${res.status}`)
  return (await res.json()) as ProjectSummary[]
}

// What it takes to draw those cards (G1, #231), by game. It is asked for apart from the list and
// after it: the list is the first screen and draws on its own answer, and this one answer carries
// every game's card so no game in the list costs a round trip of its own.
export async function myCards(http: string): Promise<Record<string, CardFace | null>> {
  const res = await fetch(`${http}/me/cards`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not read the cards: ${res.status}`)
  return (await res.json()) as Record<string, CardFace | null>
}

// Sharing a game (D3): who it is shared with, an invitation to an address, and taking it back.
export type Member = { email: string; role: Role }
export async function projectMembers(http: string, project: string, t: T = swedish): Promise<Member[]> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/members`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(t('error.members.failed'))
  return (await res.json()) as Member[]
}

export async function inviteToProject(http: string, project: string, email: string, role: Role, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/invites`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, role, ...pageLang() }) }))
  if (res.status === 401) throw new Unauthorized()
  if (res.status === 403) throw new Error(t('error.invite.notOwner'))
  // What the service could not do, said as the reason and not as its number (#477).
  if (res.status === 400) throw new Error(t('error.invite.address'))
  if (res.status === 409) {
    const { why } = (await res.json().catch(() => ({}))) as { why?: string }
    throw new Error(t(why === 'invited' ? 'error.invite.pending' : 'error.invite.member', { email }))
  }
  if (!res.ok) throw new Error(t('error.invite.failed'))
}

// The invitations nobody has followed yet (#477), for whoever may share; and taking one back.
export type WaitingInvite = { email: string; role: Role; expiresAt: string }
export async function waitingInvites(http: string, project: string, t: T = swedish): Promise<WaitingInvite[]> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/invites`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  // A role that may not share has nothing waiting to see; that is an answer, not a fault.
  if (res.status === 403) return []
  if (!res.ok) throw new Error(t('error.invites.failed'))
  return (await res.json()) as WaitingInvite[]
}

export async function withdrawInvite(http: string, project: string, email: string, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/invites/${encodeURIComponent(email)}`, withCredentials({ method: 'DELETE' }))
  if (res.status === 401) throw new Unauthorized()
  // Already followed or already gone: what the owner wanted is true either way.
  if (!res.ok && res.status !== 404) throw new Error(t('error.withdraw.failed', { email }))
}

export async function unshareProject(http: string, project: string, email: string, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/members/${encodeURIComponent(email)}`, withCredentials({ method: 'DELETE' }))
  if (res.status === 401) throw new Unauthorized()
  if (res.status === 403) throw new Error(t('error.unshare.notOwner'))
  if (!res.ok) throw new Error(t('error.unshare.failed'))
}

// Following an invitation: 'not-logged-in' asks for a login first, 'spent' means it is gone.
export async function acceptInvite(http: string, token: string, t: T = swedish): Promise<{ project: string; role: Role } | 'not-logged-in' | 'spent'> {
  const res = await fetch(`${http}/invites/${encodeURIComponent(token)}`, withCredentials({ method: 'POST' }))
  if (res.status === 401) return 'not-logged-in'
  if (res.status === 404) return 'spent'
  if (!res.ok) throw new Error(t('error.join.failed'))
  return (await res.json()) as { project: string; role: Role }
}

// Starting a table from the home page (G1): the same session the editor starts, so the code and
// the host key come from the server and nowhere else.
export async function startTable(http: string, project: string, t: T = swedish): Promise<{ id: string; code: string; hostKey: string }> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/sessions`, withCredentials({ method: 'POST' }))
  if (res.status === 401) throw new Unauthorized()
  // Every role but a viewer may start one (D3); the page does not offer it to a viewer (#689),
  // so a refusal is an answer that changed under the page, said as what it means.
  if (res.status === 403) throw new Error(t('error.startTable.viewer'))
  if (res.status === 404) throw new Error(t('error.game.gone'))
  if (!res.ok) throw new Error(t('error.startTable.failed'))
  return (await res.json()) as { id: string; code: string; hostKey: string }
}

// Taking a game away (G1): its whole history goes with it, so the page asks first.
export async function removeProject(http: string, project: string, t: T = swedish): Promise<void> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}`, withCredentials({ method: 'DELETE' }))
  if (res.status === 401) throw new Unauthorized()
  if (res.status === 403) throw new Error(t('error.removeGame.notOwner'))
  if (res.status === 404) throw new Error(t('error.game.gone'))
  if (!res.ok) throw new Error(t('error.removeGame.failed'))
}

// A guest session claimed to the account afterwards (G1), and the tables the account sat at.
export type Played = { session: string; seat: string | null; name: string; kind: 'seat' | 'observer'; at: string; game: string | null; version: string; ended: boolean; surveyed: boolean; flags: number; code?: string; deleted?: true }
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

// A whole game to keep (G5, #527, #529). Asking starts the print files; reading says how far they
// have come until the zip is ready. The same question twice is the same question: nothing is held
// between the two, so a window closed half-way and opened again goes on from where the renderer is.
export type ExportState = { state: 'preparing'; total: number; done: number } | { state: 'ready'; zip: Blob; name: string } | { state: 'refused'; status: number }
export async function startExport(http: string, project: string): Promise<ExportState> {
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/export`, withCredentials({ method: 'POST' }))
  if (res.status !== 202) return { state: 'refused', status: res.status }
  const body = (await res.json()) as { total: number; done: number }
  return { state: 'preparing', total: body.total, done: body.done }
}
export async function readExport(http: string, project: string): Promise<ExportState> {
  const q = new URLSearchParams(pageLang())
  const res = await fetch(`${http}/projects/${encodeURIComponent(project)}/export?${q.toString()}`, withCredentials())
  // Saved under the name the server gives it (#542), which says the version the zip holds: the
  // list the window was opened from may be a version behind.
  if (res.status === 200) return { state: 'ready', zip: await res.blob(), name: zipName(res.headers.get('content-disposition'), project) }
  if (res.status !== 202) return { state: 'refused', status: res.status }
  const body = (await res.json()) as { total: number; done: number }
  return { state: 'preparing', total: body.total, done: body.done }
}

// The file name in a `content-disposition`: `filename*` in UTF-8 when the game's name needs it,
// the plain `filename` when it does not (RFC 6266), and the game when the header says nothing.
export function zipName(disposition: string | null, fallback: string): string {
  const star = disposition ? /filename\*=UTF-8''([^;]+)/i.exec(disposition) : null
  if (star?.[1]) return decodeURIComponent(star[1])
  const plain = disposition ? /filename="([^"]+)"/i.exec(disposition) : null
  return plain?.[1] ?? `${fallback}.zip`
}

// An export brought back as a new game (G5, #528). Why it could not be comes back as codes, which
// the window says in the reader's words.
export type ImportProblem = { code: string; values?: Record<string, string | number> }
export async function importGame(http: string, file: Blob): Promise<{ ok: true; id: string } | { ok: false; problems: ImportProblem[] }> {
  const q = new URLSearchParams(pageLang())
  const res = await fetch(`${http}/projects/import?${q.toString()}`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/zip' }, body: file }))
  if (res.status === 201) return { ok: true, id: ((await res.json()) as { id: string }).id }
  if (res.status === 413) return { ok: false, problems: [{ code: 'too-big' }] }
  const body = (await res.json().catch(() => ({}))) as { problems?: ImportProblem[] }
  return { ok: false, problems: body.problems ?? [{ code: 'refused' }] }
}

// The account's session from the browser's side: who is signed in, signing in and out, and the
// addresses that lead there (G1, DRIFT §11). Apart from the rest of the account client because every
// surface reaches it — the phone to save its seat, the felt to know its owner — and none of these
// has a sentence of the reader's to say, so the account catalogue's messages stay with the pages
// that do (#760).

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
export const pageLang = (): { lang?: string } => {
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

// Who is signed in, with the name the account goes by to others (#1254) and whether it has been asked
// for one; null for nobody.
export type Me = { email: string; name: string | null; asked: boolean }
export async function myAccount(http: string): Promise<Me | null> {
  const res = await fetch(`${http}/auth/me`, withCredentials())
  if (!res.ok) throw new Error(`could not read the account: ${res.status}`)
  const me = (await res.json()) as { email: string | null; name?: string | null; asked?: boolean }
  // A server from before the name has asked nobody and has nowhere to keep an answer, so its
  // accounts are taken as asked rather than sent to a step that could not be saved.
  return me.email === null ? null : { email: me.email, name: me.name ?? null, asked: me.asked ?? true }
}

// The account's name (#1254), or none: either is the answer to the question, which is not put again.
// `false` when the server would not keep it.
export async function saveName(http: string, name: string | null): Promise<{ name: string | null } | false> {
  const res = await fetch(`${http}/me/name`, withCredentials({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) }))
  if (res.status === 400) return false
  if (!res.ok) throw new Error(`could not save the name: ${res.status}`)
  return (await res.json()) as { name: string | null }
}

// Where a login made on the page goes on to (#1254, variant C): the welcome step first for an account
// that has not been asked what the others should call it, and `next` after it. The link's own way in
// is the server's (`/auth/verify`); this is the passkey's and the development login's.
export async function arrival(http: string, next: string): Promise<string> {
  const me = await myAccount(http).catch(() => null)
  if (!me || me.asked) return next
  const q = new URLSearchParams({ next })
  const server = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('server')
  if (server) q.set('server', server)
  return `/welcome?${q.toString()}`
}

export async function logout(http: string): Promise<void> {
  await fetch(`${http}/auth/logout`, withCredentials({ method: 'POST' }))
}

export async function claimGuest(http: string, token: string): Promise<{ ok: true; session: string; seat: string | null; name: string } | { ok: false; reason: 'not-logged-in' | 'unknown' | 'other' }> {
  const res = await fetch(`${http}/guests/claim`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) }))
  if (res.status === 401) return { ok: false, reason: 'not-logged-in' }
  if (res.status === 404) return { ok: false, reason: 'unknown' }
  if (res.status === 409) return { ok: false, reason: 'other' }
  if (!res.ok) throw new Error(`could not claim: ${res.status}`)
  return { ok: true, ...((await res.json()) as { session: string; seat: string | null; name: string }) }
}

// The phone's way to save a session (G1): the claim page, which asks for a login first when
// there is none. The phone names its server as a WebSocket origin; the account pages speak HTTP.
// `next` is the page the guest came from, which the claim goes back to once it is made (#690).
export function claimUrl(token: string, server: string | null, next: string = location.pathname + location.search): string {
  const claim = new URLSearchParams({ token, next })
  if (server) claim.set('server', server.replace(/^ws/, 'http'))
  return `/claim?${claim.toString()}`
}

// Where to log in from a page, and come back to it after.
export function loginUrl(next: string, server: string | null): string {
  const q = new URLSearchParams({ next })
  if (server) q.set('server', server)
  return `/login?${q.toString()}`
}

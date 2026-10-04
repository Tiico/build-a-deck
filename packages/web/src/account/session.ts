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
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`could not read the account: ${res.status}`)
  return ((await res.json()) as { email: string }).email
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

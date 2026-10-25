import { withCredentials } from './session.js'

// The account's own name (#1254), apart from `session.ts`: that module travels with every surface,
// the phone's included (#760), and only the account's pages, the login card and the observer's page
// ever ask what the account is called.

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
  const q = new URLSearchParams({ step: 'name', next })
  const server = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('server')
  if (server) q.set('server', server)
  return `/login?${q.toString()}`
}

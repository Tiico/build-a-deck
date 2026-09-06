// The creator's account (G1, DRIFT §11) from the browser's side: a magic link by mail, a cookie
// the browser keeps, and the projects that belong to the account. `http` is the server origin;
// in development it is another port, so credentials are sent explicitly.
export class Unauthorized extends Error {
  constructor() {
    super('not logged in')
    this.name = 'Unauthorized'
  }
}

export const withCredentials = (init: RequestInit = {}): RequestInit => ({ ...init, credentials: 'include' })

export async function requestLink(http: string, email: string, next: string): Promise<'sent' | 'too-many' | 'invalid'> {
  const res = await fetch(`${http}/auth/login`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, next }) }))
  if (res.status === 429) return 'too-many'
  if (res.status === 400) return 'invalid'
  if (!res.ok) throw new Error(`could not ask for a link: ${res.status}`)
  return 'sent'
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

export type ProjectSummary = { id: string; name: string; rev: number }
export async function myProjects(http: string): Promise<ProjectSummary[]> {
  const res = await fetch(`${http}/projects`, withCredentials())
  if (res.status === 401) throw new Unauthorized()
  if (!res.ok) throw new Error(`could not list projects: ${res.status}`)
  return (await res.json()) as ProjectSummary[]
}

// Where to log in from a page, and come back to it after.
export function loginUrl(next: string, server: string | null): string {
  const q = new URLSearchParams({ next })
  if (server) q.set('server', server)
  return `/login?${q.toString()}`
}

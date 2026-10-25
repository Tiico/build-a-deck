import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { PasskeyRecord } from './passkeys.js'

// Accounts for creators (G1, DRIFT §11): a magic link by mail, a session cookie, no passwords.
// Tokens and session ids are random and stored hashed; a token is one use and short-lived.

export type Account = { id: string; email: string }
export type AuthStore = {
  issueToken(tokenHash: string, email: string, expiresAt: string): Promise<void>
  // The email behind an unused, unexpired token; marks it used.
  redeemToken(tokenHash: string, now: string): Promise<string | null>
  ensureAccount(email: string): Promise<Account>
  // The account behind an id, so a members list (D3) can show addresses rather than ids.
  accountById(id: string): Promise<Account | null>
  // The account behind an address as the login stores it, without making one: the operator's
  // scripts name accounts by address (DRIFT §10) and must never create one by naming it.
  accountByEmail(email: string): Promise<Account | null>
  // Every account, oldest first, for the operator's usage report (#1193).
  listAccounts(): Promise<Account[]>
  createSession(sessionHash: string, accountId: string, expiresAt: string): Promise<void>
  sessionAccount(sessionHash: string, now: string): Promise<Account | null>
  deleteSession(sessionHash: string): Promise<void>
  // Passkeys (#1180): kept by the account they log in to, found by their credential id.
  addPasskey(passkey: PasskeyRecord): Promise<void>
  passkey(id: string): Promise<PasskeyRecord | null>
  passkeysOf(accountId: string): Promise<PasskeyRecord[]>
  // A login with it: the authenticator's new counter, and when.
  usePasskey(id: string, counter: number, at: string): Promise<void>
  // Only the account's own; false when it had none by that id.
  removePasskey(accountId: string, id: string): Promise<boolean>
  // The terms (#1270): the account accepted this version at `at`. One row per account and version,
  // and never written over: accepting a version again leaves the first time where it was.
  acceptTerms(accountId: string, version: string, at: string): Promise<void>
  // Every version the account has accepted, oldest first, with when.
  termsAccepted(accountId: string): Promise<TermsAcceptance[]>
}

export type TermsAcceptance = { version: string; at: string }

// `text` is the part every reader gets; `html` (#1098) is the letter a client that draws HTML shows
// instead, and a mail without one is sent as text alone.
export type Mail = { to: string; subject: string; text: string; html?: string }
export type Mailer = { send(mail: Mail): Promise<void> }

export const TOKEN_TTL_MS = 15 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
export const COOKIE = 'byd_session'
const LOGINS_PER_HOUR = 5

// The language the reader asked for (A4). Anything the tool does not speak is not an error: the
// mail simply goes out in Swedish, which is the language the tool is written in.
export const LANGS = ['sv', 'en'] as const
export type Lang = (typeof LANGS)[number]
export const langOf = (value: unknown): Lang => (LANGS.includes(value as Lang) ? (value as Lang) : 'sv')

export const LoginBody = z.object({ email: z.string().email().max(254), next: z.string().max(2000).optional(), lang: z.string().max(8).optional() })

export const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
export const token = (): string => randomBytes(32).toString('base64url')

export class MemoryAuthStore implements AuthStore {
  private readonly tokens = new Map<string, { email: string; expiresAt: string; used: boolean }>()
  private readonly accounts = new Map<string, Account>()
  private readonly sessions = new Map<string, { accountId: string; expiresAt: string }>()
  private readonly passkeys = new Map<string, PasskeyRecord>()
  private readonly acceptances = new Map<string, TermsAcceptance[]>()
  async issueToken(tokenHash: string, email: string, expiresAt: string): Promise<void> {
    this.tokens.set(tokenHash, { email, expiresAt, used: false })
  }
  async redeemToken(tokenHash: string, now: string): Promise<string | null> {
    const t = this.tokens.get(tokenHash)
    if (!t || t.used || t.expiresAt < now) return null
    t.used = true
    return t.email
  }
  async ensureAccount(email: string): Promise<Account> {
    const existing = this.accounts.get(email)
    if (existing) return existing
    const account = { id: token(), email }
    this.accounts.set(email, account)
    return account
  }
  async accountById(id: string): Promise<Account | null> {
    return [...this.accounts.values()].find((a) => a.id === id) ?? null
  }
  async accountByEmail(email: string): Promise<Account | null> {
    return this.accounts.get(email) ?? null
  }
  async listAccounts(): Promise<Account[]> {
    return [...this.accounts.values()]
  }
  async createSession(sessionHash: string, accountId: string, expiresAt: string): Promise<void> {
    this.sessions.set(sessionHash, { accountId, expiresAt })
  }
  async sessionAccount(sessionHash: string, now: string): Promise<Account | null> {
    const s = this.sessions.get(sessionHash)
    if (!s || s.expiresAt < now) return null
    return [...this.accounts.values()].find((a) => a.id === s.accountId) ?? null
  }
  async deleteSession(sessionHash: string): Promise<void> {
    this.sessions.delete(sessionHash)
  }
  async addPasskey(passkey: PasskeyRecord): Promise<void> {
    this.passkeys.set(passkey.id, { ...passkey })
  }
  async passkey(id: string): Promise<PasskeyRecord | null> {
    const p = this.passkeys.get(id)
    return p ? { ...p } : null
  }
  // Newest first, as the profile lists them.
  async passkeysOf(accountId: string): Promise<PasskeyRecord[]> {
    return [...this.passkeys.values()].filter((p) => p.accountId === accountId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => ({ ...p }))
  }
  async usePasskey(id: string, counter: number, at: string): Promise<void> {
    const p = this.passkeys.get(id)
    if (p) Object.assign(p, { counter, lastUsedAt: at })
  }
  async removePasskey(accountId: string, id: string): Promise<boolean> {
    if (this.passkeys.get(id)?.accountId !== accountId) return false
    return this.passkeys.delete(id)
  }
  async acceptTerms(accountId: string, version: string, at: string): Promise<void> {
    const rows = this.acceptances.get(accountId) ?? []
    if (!rows.some((r) => r.version === version)) this.acceptances.set(accountId, [...rows, { version, at }])
  }
  async termsAccepted(accountId: string): Promise<TermsAcceptance[]> {
    return (this.acceptances.get(accountId) ?? []).map((r) => ({ ...r })).sort((a, b) => a.at.localeCompare(b.at) || a.version.localeCompare(b.version))
  }
}

// Mail in tests: recorded, never sent.
export class MemoryMailer implements Mailer {
  readonly sent: Mail[] = []
  async send(mail: Mail): Promise<void> {
    this.sent.push(mail)
  }
}

// Mail in development without a provider: the link goes to the log.
export class ConsoleMailer implements Mailer {
  async send(mail: Mail): Promise<void> {
    console.log(JSON.stringify({ msg: 'mail', to: mail.to, subject: mail.subject, text: mail.text }))
  }
}

// Resend (DRIFT §12): a home IP is blacklisted, so mail leaves through a provider.
export class ResendMailer implements Mailer {
  constructor(private readonly apiKey: string, readonly from: string, private readonly fetcher: typeof fetch = fetch) {}
  async send(mail: Mail): Promise<void> {
    const res = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.html ? { html: mail.html } : {}) }),
    })
    if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`)
  }
}

// The one place the environment decides how a login link travels (DRIFT §12). Without a key
// the link goes to the container log, which is the development mode; an address left empty in
// the stack would otherwise become a `from:` Resend refuses, one login too late to notice.
export function mailerFromEnv(env: Record<string, string | undefined>): Mailer {
  const apiKey = env['RESEND_API_KEY']
  if (!apiKey) return new ConsoleMailer()
  return new ResendMailer(apiKey, env['MAIL_FROM'] || 'Deckster <login@example.com>')
}

// Five links an hour per address (DRIFT §9 is the outer wall; this is the inner one).
export class LoginLimiter {
  private readonly sent = new Map<string, number[]>()
  allow(email: string, now: number): boolean {
    const recent = (this.sent.get(email) ?? []).filter((t) => now - t < 3600_000)
    if (recent.length >= LOGINS_PER_HOUR) return false
    recent.push(now)
    this.sent.set(email, recent)
    return true
  }
}

export function cookieValue(req: IncomingMessage, name: string): string | null {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return decodeURIComponent(v.join('='))
  }
  return null
}

export async function accountOf(store: AuthStore, req: IncomingMessage): Promise<Account | null> {
  const sid = cookieValue(req, COOKIE)
  return sid ? store.sessionAccount(hash(sid), new Date().toISOString()) : null
}

// Only a path on this site may be the landing after login: never an open redirect.
export function safeNext(next: string | undefined): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

// A landing's path and query, and its fragment with the `#` — percent-encoded as a URL would hold
// it, so that it cannot leave an attribute in the mail — or '' when it has none.
export function splitFragment(next: string): [string, string] {
  const at = next.indexOf('#')
  return at < 0 ? [next, ''] : [next.slice(0, at), new URL(next.slice(at), 'http://next.invalid').hash]
}

// The mail itself, text and HTML, is `login-mail.ts`'s (#757, #1098).
export { loginMail } from './login-mail.js'

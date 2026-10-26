import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { PasskeyRecord } from './passkeys.js'

// Accounts for creators (G1, DRIFT §11): a magic link by mail, a session cookie, no passwords.
// Tokens and session ids are random and stored hashed; a token is one use and short-lived.

// `name` is what the others call the account (#1254), null until the designer gives one, and
// `asked` whether she has been asked for it: answered or passed by, the question is never put again.
// Every store fills both; they are optional only so that an account written by hand in a test, or
// by a store from before the name, reads as one that has none and has not been asked.
export type Account = { id: string; email: string; name?: string | null; asked?: boolean }
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
  // The account's own name (#1254): null for none. Setting it, or setting none, is the answer to the
  // question, so the account is asked no more.
  setName(accountId: string, name: string | null): Promise<void>
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
  // What can no longer be used (#1277, G6): the login links that are spent or ran out, and the
  // sessions that ran out. `GET /auth/verify` says the same of a spent link, one that ran out and
  // one never given, so no row is kept for its answer. How many of each went.
  sweepSpent(now: string): Promise<{ loginTokens: number; sessions: number }>
  // What the account's extract says of the account itself (#1280, art. 15): when it was made, the
  // login sessions it has and the login links sent to its address, by when each lapses. Null for no
  // such account.
  accountFacts(accountId: string): Promise<AccountFacts | null>
}

export type AccountFacts = { createdAt: string; sessions: { expiresAt: string }[]; loginLinks: { expiresAt: string; usedAt: string | null }[] }

export type TermsAcceptance = { version: string; at: string }

// `text` is the part every reader gets; `html` (#1098) is the letter a client that draws HTML shows
// instead, and a mail without one is sent as text alone.
export type Mail = { to: string; subject: string; text: string; html?: string }
export type Mailer = { send(mail: Mail): Promise<void> }

export const TOKEN_TTL_MS = 15 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
export const COOKIE = 'byd_session'
const LOGINS_PER_HOUR = 5
const HOUR_MS = 3600_000

// The language the reader asked for (A4). Anything the tool does not speak is not an error: the
// mail simply goes out in Swedish, which is the language the tool is written in.
export const LANGS = ['sv', 'en'] as const
export type Lang = (typeof LANGS)[number]
export const langOf = (value: unknown): Lang => (LANGS.includes(value as Lang) ? (value as Lang) : 'sv')

export const LoginBody = z.object({ email: z.string().email().max(254), next: z.string().max(2000).optional(), lang: z.string().max(8).optional() })

export const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
export const token = (): string => randomBytes(32).toString('base64url')

export class MemoryAuthStore implements AuthStore {
  private readonly tokens = new Map<string, { email: string; expiresAt: string; used: boolean; usedAt?: string }>()
  private readonly created = new Map<string, string>()
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
    t.usedAt = now
    return t.email
  }
  async ensureAccount(email: string): Promise<Account> {
    const existing = this.accounts.get(email)
    if (existing) return existing
    const account = { id: token(), email, name: null, asked: false }
    this.accounts.set(email, account)
    this.created.set(account.id, new Date().toISOString())
    return { ...account }
  }
  async accountById(id: string): Promise<Account | null> {
    const a = [...this.accounts.values()].find((a) => a.id === id)
    return a ? { ...a } : null
  }
  async accountByEmail(email: string): Promise<Account | null> {
    const a = this.accounts.get(email)
    return a ? { ...a } : null
  }
  async listAccounts(): Promise<Account[]> {
    return [...this.accounts.values()].map((a) => ({ ...a }))
  }
  async setName(accountId: string, name: string | null): Promise<void> {
    const a = [...this.accounts.values()].find((a) => a.id === accountId)
    if (a) Object.assign(a, { name, asked: true })
  }
  async createSession(sessionHash: string, accountId: string, expiresAt: string): Promise<void> {
    this.sessions.set(sessionHash, { accountId, expiresAt })
  }
  async sessionAccount(sessionHash: string, now: string): Promise<Account | null> {
    const s = this.sessions.get(sessionHash)
    if (!s || s.expiresAt < now) return null
    const a = [...this.accounts.values()].find((a) => a.id === s.accountId)
    return a ? { ...a } : null
  }
  async deleteSession(sessionHash: string): Promise<void> {
    this.sessions.delete(sessionHash)
  }
  async sweepSpent(now: string): Promise<{ loginTokens: number; sessions: number }> {
    let loginTokens = 0
    for (const [h, t] of this.tokens) if (t.used || t.expiresAt <= now) loginTokens += Number(this.tokens.delete(h))
    let sessions = 0
    for (const [h, s] of this.sessions) if (s.expiresAt <= now) sessions += Number(this.sessions.delete(h))
    return { loginTokens, sessions }
  }

  async accountFacts(accountId: string): Promise<AccountFacts | null> {
    const a = [...this.accounts.values()].find((a) => a.id === accountId)
    if (!a) return null
    const sessions = [...this.sessions.values()].filter((s) => s.accountId === accountId).map((s) => ({ expiresAt: s.expiresAt }))
    const loginLinks = [...this.tokens.values()].filter((t) => t.email === a.email).map((t) => ({ expiresAt: t.expiresAt, usedAt: t.usedAt ?? null }))
    return { createdAt: this.created.get(accountId) ?? new Date(0).toISOString(), sessions, loginLinks }
  }

  // An account that deleted itself (#1280): the account, its sessions, its passkeys, the terms it
  // accepted and the login links sent to its address. True when there was one.
  forget(accountId: string): boolean {
    const a = [...this.accounts.values()].find((a) => a.id === accountId)
    if (!a) return false
    this.accounts.delete(a.email)
    this.created.delete(accountId)
    this.acceptances.delete(accountId)
    for (const [h, s] of this.sessions) if (s.accountId === accountId) this.sessions.delete(h)
    for (const [id, p] of this.passkeys) if (p.accountId === accountId) this.passkeys.delete(id)
    for (const [h, t] of this.tokens) if (t.email.toLowerCase() === a.email.toLowerCase()) this.tokens.delete(h)
    return true
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

// Five links an hour per address (DRIFT §9 is the outer wall; this is the inner one). A refusal says
// how long until the next link may go (#1360): the seconds, rounded up, until the oldest of the five
// is an hour old, which is when the receipt on the card can say it will.
export type LoginAllowance = { ok: true } | { ok: false; retryAfter: number }
export class LoginLimiter {
  private readonly sent = new Map<string, number[]>()
  allow(email: string, now: number): LoginAllowance {
    const recent = (this.sent.get(email) ?? []).filter((t) => now - t < HOUR_MS)
    if (recent.length >= LOGINS_PER_HOUR) return { ok: false, retryAfter: Math.ceil(((recent[0] ?? now) + HOUR_MS - now) / 1000) }
    recent.push(now)
    this.sent.set(email, recent)
    return { ok: true }
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

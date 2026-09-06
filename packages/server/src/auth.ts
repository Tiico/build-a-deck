import { createHash, randomBytes } from 'node:crypto'
import type { IncomingMessage } from 'node:http'
import { z } from 'zod'

// Accounts for creators (G1, DRIFT §11): a magic link by mail, a session cookie, no passwords.
// Tokens and session ids are random and stored hashed; a token is one use and short-lived.

export type Account = { id: string; email: string }
export type AuthStore = {
  issueToken(tokenHash: string, email: string, expiresAt: string): Promise<void>
  // The email behind an unused, unexpired token; marks it used.
  redeemToken(tokenHash: string, now: string): Promise<string | null>
  ensureAccount(email: string): Promise<Account>
  createSession(sessionHash: string, accountId: string, expiresAt: string): Promise<void>
  sessionAccount(sessionHash: string, now: string): Promise<Account | null>
  deleteSession(sessionHash: string): Promise<void>
}

export type Mail = { to: string; subject: string; text: string }
export type Mailer = { send(mail: Mail): Promise<void> }

export const TOKEN_TTL_MS = 15 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000
export const COOKIE = 'byd_session'
const LOGINS_PER_HOUR = 5

export const LoginBody = z.object({ email: z.string().email().max(254), next: z.string().max(2000).optional() })

export const hash = (s: string): string => createHash('sha256').update(s).digest('hex')
export const token = (): string => randomBytes(32).toString('base64url')

export class MemoryAuthStore implements AuthStore {
  private readonly tokens = new Map<string, { email: string; expiresAt: string; used: boolean }>()
  private readonly accounts = new Map<string, Account>()
  private readonly sessions = new Map<string, { accountId: string; expiresAt: string }>()
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
  constructor(private readonly apiKey: string, private readonly from: string) {}
  async send(mail: Mail): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [mail.to], subject: mail.subject, text: mail.text }),
    })
    if (!res.ok) throw new Error(`mail failed: ${res.status} ${await res.text()}`)
  }
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

export function loginMail(to: string, link: string): Mail {
  return {
    to,
    subject: 'Logga in på build-your-deck',
    text: `Hej!\n\nKlicka för att logga in: ${link}\n\nLänken fungerar i 15 minuter och bara en gång. Har du inte bett om den kan du ignorera det här mejlet.`,
  }
}

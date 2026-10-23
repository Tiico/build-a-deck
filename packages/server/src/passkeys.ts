import { randomBytes } from 'node:crypto'
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse, type AuthenticationResponseJSON, type RegistrationResponseJSON } from '@simplewebauthn/server'
import { z } from 'zod'
import type { Account, AuthStore } from './auth.js'

// Passkeys (#1180, DRIFT §11): a convenience beside the magic link, never instead of it. Whoever
// logged in with the link may save one in the browser, and logs in with it the next time without a
// mail; the mail stays the way back for whoever lost the device.
//
// The WebAuthn checks are `@simplewebauthn/server`'s (#1180, beställarens beslut): CBOR, COSE and
// signatures are not written here. What is ours is which ceremonies exist, who may start them, the
// one-use challenges, and what a passkey is called on the profile.

// What the store keeps of a passkey: the public key and its counter for the check, and what the
// profile may say about it — the keychain it lives in (from the AAGUID) and the device it was saved
// from (from the browser that saved it).
export type PasskeyRecord = {
  id: string
  accountId: string
  publicKey: Uint8Array
  counter: number
  transports: string[]
  aaguid: string
  device: string
  createdAt: string
  lastUsedAt: string | null
}

// A passkey as the profile shows it: never the key.
export type PasskeyView = { id: string; keychain: Keychain | null; device: string; createdAt: string; lastUsedAt: string | null }

export const viewOf = (p: PasskeyRecord): PasskeyView => ({ id: p.id, keychain: keychainOf(p.aaguid), device: p.device, createdAt: p.createdAt, lastUsedAt: p.lastUsedAt })

// The keychains a passkey is most often saved in, by the AAGUID their authenticators report
// (passkeydeveloper/passkey-authenticator-aaguids). The web names each in the reader's language —
// Apple says «iCloud-nyckelring» in Swedish — so the wire carries which one and not what it is
// called; an unknown one is said as a passkey and nothing more.
export const KEYCHAINS = ['icloud', 'google', 'chrome-mac', 'windows-hello', '1password', 'bitwarden', 'dashlane', 'samsung-pass'] as const
export type Keychain = (typeof KEYCHAINS)[number]
const BY_AAGUID: Record<string, Keychain> = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'icloud',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'icloud',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'google',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'chrome-mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'windows-hello',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'windows-hello',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'windows-hello',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'dashlane',
  '53414d53-554e-4700-0000-000000000000': 'samsung-pass',
}
export const keychainOf = (aaguid: string): Keychain | null => BY_AAGUID[aaguid] ?? null

// The device a passkey was saved from, as the browser that saved it says: «Safari · macOS». Only
// the two words a person recognises; the rest of a user agent is noise, and none of it is checked.
export function deviceOf(userAgent: string | undefined): string {
  const ua = userAgent ?? ''
  const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : null
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\/|FxiOS/.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : null
  return [browser, os].filter(Boolean).join(' · ') || '–'
}

// The site a passkey belongs to: the page the browser stands on, which is the web app's origin and
// not necessarily this API's (`appOrigin` in development). Its host is the passkey's RP ID —
// `deckster.se` in production (A5) — and a passkey made on one host is never offered on another.
export type Site = { rpID: string; origins: string[] }
export function siteOf(origins: readonly (string | null | undefined)[]): Site {
  const all = origins.flatMap((o) => {
    try {
      return o ? [new URL(o).origin] : []
    } catch {
      return []
    }
  })
  const first = all[0]
  if (!first) throw new Error('a passkey needs a site')
  const rpID = new URL(first).hostname
  return { rpID, origins: [...new Set(all.filter((o) => new URL(o).hostname === rpID))] }
}

// A challenge is good once and for five minutes, for the ceremony and the account it was issued to.
// In memory: a deploy forgets them, and the reader simply presses the button again.
export const CHALLENGE_TTL_MS = 5 * 60 * 1000
const MAX_CHALLENGES = 10_000
type Issued = { purpose: 'register' | 'login'; accountId: string | null; expiresAt: number }
export class PasskeyChallenges {
  private readonly issued = new Map<string, Issued>()
  constructor(private readonly now: () => number = Date.now) {}
  issue(purpose: Issued['purpose'], accountId: string | null): string {
    const at = this.now()
    for (const [c, i] of this.issued) if (i.expiresAt <= at) this.issued.delete(c)
    // A flood of asks for options may not grow memory without end: the oldest go first.
    while (this.issued.size >= MAX_CHALLENGES) this.issued.delete(this.issued.keys().next().value as string)
    const challenge = randomBytes(32).toString('base64url')
    this.issued.set(challenge, { purpose, accountId, expiresAt: at + CHALLENGE_TTL_MS })
    return challenge
  }
  // Spends the challenge whatever the answer, so one challenge is never tried twice.
  take(challenge: string, purpose: Issued['purpose'], accountId: string | null): boolean {
    const i = this.issued.get(challenge)
    this.issued.delete(challenge)
    return !!i && i.purpose === purpose && i.accountId === accountId && i.expiresAt > this.now()
  }
}

// The bodies the browser sends back: `@simplewebauthn/browser`'s JSON, checked in its shape here and
// in its bytes by the library.
const Response = z.object({ response: z.object({ id: z.string().max(1024), rawId: z.string().max(1024), type: z.literal('public-key'), response: z.record(z.string(), z.unknown()) }).passthrough() })

export type Answer = { status: number; body: unknown; login?: Account }

export type Ceremonies = { auth: AuthStore; challenges: PasskeyChallenges; site: Site; now: Date }

// Saving a passkey, step one: what the browser hands the keychain. The account's own passkeys are
// excluded, so a keychain that already holds one for this account says so rather than making two.
export async function registrationOptions(c: Ceremonies, account: Account): Promise<Answer> {
  const mine = await c.auth.passkeysOf(account.id)
  const options = await generateRegistrationOptions({
    rpName: 'Deckster',
    rpID: c.site.rpID,
    userName: account.email,
    userID: new TextEncoder().encode(account.id),
    challenge: bytesOf(c.challenges.issue('register', account.id)),
    attestationType: 'none',
    excludeCredentials: mine.map((p) => ({ id: p.id, transports: p.transports })),
    // A discoverable passkey, so the next login needs no address typed; checked by the device's own
    // lock where it has one.
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  })
  return { status: 200, body: options }
}

// Saving a passkey, step two: the keychain's answer, checked, and kept.
export async function register(c: Ceremonies, account: Account, body: unknown, userAgent: string | undefined): Promise<Answer> {
  const parsed = Response.safeParse(body)
  if (!parsed.success) return { status: 400, body: { error: 'that is not a passkey' } }
  try {
    const verified = await verifyRegistrationResponse({
      response: parsed.data.response as unknown as RegistrationResponseJSON,
      expectedChallenge: (challenge) => c.challenges.take(challenge, 'register', account.id),
      expectedOrigin: c.site.origins,
      expectedRPID: c.site.rpID,
      requireUserVerification: false,
    })
    if (!verified.verified) return { status: 400, body: { error: 'the passkey could not be checked' } }
    const { credential, aaguid } = verified.registrationInfo
    const record: PasskeyRecord = { id: credential.id, accountId: account.id, publicKey: credential.publicKey, counter: credential.counter, transports: credential.transports ?? [], aaguid, device: deviceOf(userAgent), createdAt: c.now.toISOString(), lastUsedAt: null }
    if (await c.auth.passkey(record.id)) return { status: 409, body: { error: 'that passkey is already saved' } }
    await c.auth.addPasskey(record)
    return { status: 200, body: viewOf(record) }
  } catch {
    return { status: 400, body: { error: 'the passkey could not be checked' } }
  }
}

// Logging in, step one: a challenge and nothing else. No list of passkeys, since nobody is known
// yet — the keychain offers whichever it holds for this site — and so nothing here says whether an
// address exists or has a passkey.
export async function loginOptions(c: Ceremonies): Promise<Answer> {
  return { status: 200, body: await generateAuthenticationOptions({ rpID: c.site.rpID, challenge: bytesOf(c.challenges.issue('login', null)), userVerification: 'preferred' }) }
}

// Logging in, step two: the passkey's signature, checked against the key the account saved. A
// passkey that is not known — removed on the profile, or never saved — is one answer, whatever the
// reason, and the reader is sent to the mail.
export async function login(c: Ceremonies, body: unknown): Promise<Answer> {
  const parsed = Response.safeParse(body)
  if (!parsed.success) return { status: 400, body: { error: 'that is not a passkey' } }
  const response = parsed.data.response as unknown as AuthenticationResponseJSON
  const saved = await c.auth.passkey(response.id)
  const unknown: Answer = { status: 401, body: { error: 'that passkey is not known here; log in with the link' } }
  if (!saved) {
    // The challenge is spent all the same.
    c.challenges.take(challengeOf(response) ?? '', 'login', null)
    return unknown
  }
  try {
    const verified = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) => c.challenges.take(challenge, 'login', null),
      expectedOrigin: c.site.origins,
      expectedRPID: c.site.rpID,
      credential: { id: saved.id, publicKey: new Uint8Array(saved.publicKey), counter: saved.counter, transports: saved.transports },
      requireUserVerification: false,
    })
    if (!verified.verified) return unknown
    const account = await c.auth.accountById(saved.accountId)
    if (!account) return unknown
    await c.auth.usePasskey(saved.id, verified.authenticationInfo.newCounter, c.now.toISOString())
    return { status: 200, body: { ok: true }, login: account }
  } catch {
    return unknown
  }
}

// The library takes a challenge as bytes, and a string as the bytes of its letters: the challenge
// the browser signs is then the base64url of the issued one, and never found again.
const bytesOf = (challenge: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(challenge, 'base64url'))

function challengeOf(response: AuthenticationResponseJSON): string | null {
  try {
    return (JSON.parse(Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8')) as { challenge?: string }).challenge ?? null
  } catch {
    return null
  }
}

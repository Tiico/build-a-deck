import { createContext, useContext } from 'react'
import { WebAuthnAbortService, browserSupportsWebAuthn, browserSupportsWebAuthnAutofill, platformAuthenticatorIsAvailable, startAuthentication, startRegistration } from '@simplewebauthn/browser'
import { withCredentials } from './session.js'

// Passkeys from the browser's side (#1180, beslut: variant A, plus the suggestion in the field).
// Saving one after the link, logging in with one, and the list on the profile. The browser's own
// sheet does the asking; what is ours is when it is asked for, and what is said around it.

// The browser's keychain, behind a seam: the suites hand the pages a software keychain
// (`test-support/soft-passkey.ts`) through `KeychainContext`, since jsdom has no WebAuthn, and
// the end-to-end suite meets Chromium's own virtual one through the real thing.
export type Keychain = {
  // Whether the browser can make a passkey at all.
  supported(): boolean
  // Whether this device has its own keychain to keep one in — a fingerprint, a face or the screen
  // lock — which is what the offer promises.
  platform(): Promise<boolean>
  // Whether the browser can suggest a passkey in the address field (conditional mediation).
  autofill(): Promise<boolean>
  create(options: unknown): Promise<{ id: string }>
  get(options: unknown, autofill: boolean): Promise<{ id: string }>
}

export const browserKeychain: Keychain = {
  supported: () => browserSupportsWebAuthn(),
  platform: () => platformAuthenticatorIsAvailable(),
  autofill: () => browserSupportsWebAuthnAutofill(),
  create: (options) => startRegistration({ optionsJSON: options as Parameters<typeof startRegistration>[0]['optionsJSON'] }),
  get: (options, autofill) => startAuthentication({ optionsJSON: options as Parameters<typeof startAuthentication>[0]['optionsJSON'], useBrowserAutofill: autofill }),
}

export const KeychainContext = createContext<Keychain>(browserKeychain)
export const useKeychain = (): Keychain => useContext(KeychainContext)

// A suggestion waiting in the address field is let go of before anything else asks the keychain:
// the browser runs one ceremony at a time.
export const letGoOfSuggestion = (): void => WebAuthnAbortService.cancelCeremony()

// What this browser remembers (#1180): which passkey it saved or logged in with, so the offer is not
// made again and the profile can say «Den här webbläsaren»; or that it was told «Inte nu». Per
// browser and nowhere else, and a browser that keeps nothing simply offers again.
const HERE = 'byd.passkey.here'
const DECLINED = 'byd.passkey.declined'
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // A browser that keeps nothing offers again next time; nothing else depends on it.
  }
}
export const here = {
  id: (): string | null => read(HERE),
  set: (id: string): void => write(HERE, id),
  forget: (): void => write(HERE, null),
  declined: (): boolean => read(DECLINED) !== null,
  decline: (): void => write(DECLINED, '1'),
}

// The reader closed the browser's sheet, or another ceremony took its place: nothing went wrong, and
// nothing is said.
const cancelled = (err: unknown): boolean => err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'AbortError' || (err as { code?: string }).code === 'ERROR_CEREMONY_ABORTED')
// The keychain already holds a passkey for this account: the server excluded it, and the browser said so.
const already = (err: unknown): boolean => err instanceof Error && (err.name === 'InvalidStateError' || (err as { code?: string }).code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED')

const post = (http: string, path: string, body: unknown): Promise<Response> => fetch(`${http}${path}`, withCredentials({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

// Whether the offer belongs on this page in this browser: one that can keep a passkey of its own,
// that has none yet, and that was not told «Inte nu».
export async function offerable(keychain: Keychain): Promise<boolean> {
  if (here.id() || here.declined() || !keychain.supported()) return false
  return keychain.platform().catch(() => false)
}

export type Saved = 'saved' | 'already' | 'cancelled' | 'failed'
export async function savePasskey(http: string, keychain: Keychain): Promise<Saved> {
  try {
    const options = await post(http, '/auth/passkeys/register/options', {})
    if (!options.ok) return 'failed'
    letGoOfSuggestion()
    const response = await keychain.create(await options.json())
    const saved = await post(http, '/auth/passkeys/register', { response })
    if (!saved.ok) return 'failed'
    here.set(((await saved.json()) as { id: string }).id)
    return 'saved'
  } catch (err) {
    if (already(err)) {
      here.set('known')
      return 'already'
    }
    return cancelled(err) ? 'cancelled' : 'failed'
  }
}

export type LoggedIn = 'in' | 'unknown' | 'cancelled' | 'failed'
// `autofill` waits for the reader to pick the passkey the browser suggests in the address field,
// and may wait for as long as the card is open.
export async function loginWithPasskey(http: string, keychain: Keychain, autofill = false): Promise<LoggedIn> {
  try {
    const options = await post(http, '/auth/passkeys/login/options', {})
    if (!options.ok) return 'failed'
    if (!autofill) letGoOfSuggestion()
    const response = await keychain.get(await options.json(), autofill)
    const res = await post(http, '/auth/passkeys/login', { response })
    if (res.status === 401) return 'unknown'
    if (!res.ok) return 'failed'
    here.set(response.id)
    return 'in'
  } catch (err) {
    return cancelled(err) ? 'cancelled' : 'failed'
  }
}

// The account's passkeys as the profile lists them (`passkeys.ts` on the server): never the key.
export type Keychains = 'icloud' | 'google' | 'chrome-mac' | 'windows-hello' | '1password' | 'bitwarden' | 'dashlane' | 'samsung-pass'
export type Passkey = { id: string; keychain: Keychains | null; device: string; createdAt: string; lastUsedAt: string | null }
export async function myPasskeys(http: string): Promise<Passkey[]> {
  const res = await fetch(`${http}/auth/passkeys`, withCredentials())
  if (!res.ok) throw new Error(`could not list the passkeys: ${res.status}`)
  return ((await res.json()) as { passkeys: Passkey[] }).passkeys
}

export async function removePasskey(http: string, id: string): Promise<void> {
  const res = await fetch(`${http}/auth/passkeys/${encodeURIComponent(id)}`, withCredentials({ method: 'DELETE' }))
  if (!res.ok && res.status !== 404) throw new Error(`could not remove the passkey: ${res.status}`)
  // The passkey this browser logged in with is gone: the offer may be made here again.
  if (here.id() === id) here.forget()
}

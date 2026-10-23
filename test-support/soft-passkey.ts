import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'

// A passkey authenticator in software (#1180): what a phone's or a computer's keychain does when the
// browser asks it to make or use a passkey, so the server suites meet real WebAuthn bytes — CBOR,
// COSE, an ES256 signature — and the library that checks them is checked too. Never a mock of the
// check itself.
//
// It answers the JSON options the server hands the browser with the JSON the browser hands back
// (what `@simplewebauthn/browser` sends), for one page origin. `aaguid` says which keychain it is;
// the default is iCloud Keychain's.

export const ICLOUD_KEYCHAIN = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd'

type CreationOptions = { challenge: string; rp: { id?: string }; user: { id: string } }
type RequestOptions = { challenge: string; rpId?: string; allowCredentials?: { id: string }[] }
type Credential = { key: KeyObject; counter: number; userHandle: string; rpId: string }

export type Registration = { id: string; rawId: string; type: 'public-key'; response: { clientDataJSON: string; attestationObject: string; transports: string[] }; clientExtensionResults: Record<string, never>; authenticatorAttachment: 'platform' }
export type Assertion = { id: string; rawId: string; type: 'public-key'; response: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle: string }; clientExtensionResults: Record<string, never>; authenticatorAttachment: 'platform' }

export class SoftPasskey {
  private readonly credentials = new Map<string, Credential>()
  constructor(readonly origin: string, private readonly aaguid = ICLOUD_KEYCHAIN) {}

  // `navigator.credentials.create`: a new key pair for this site and this user.
  create(options: CreationOptions, { type = 'webauthn.create', origin = this.origin }: { type?: string; origin?: string } = {}): Registration {
    const rpId = options.rp.id ?? new URL(this.origin).hostname
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    const id = randomBytes(16)
    this.credentials.set(b64u(id), { key: privateKey, counter: 0, userHandle: options.user.id, rpId })
    const jwk = publicKey.export({ format: 'jwk' })
    const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, fromB64u(jwk.x ?? '')], [-3, fromB64u(jwk.y ?? '')]]))
    const length = Buffer.alloc(2)
    length.writeUInt16BE(id.length)
    const attested = Buffer.concat([Buffer.from(this.aaguid.replaceAll('-', ''), 'hex'), length, id, cose])
    const authData = authenticatorData(rpId, FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.BS | FLAGS.AT, 0, attested)
    const clientData = clientDataJSON(type, options.challenge, origin)
    return {
      id: b64u(id),
      rawId: b64u(id),
      type: 'public-key',
      response: { clientDataJSON: b64u(clientData), attestationObject: b64u(cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))), transports: ['internal', 'hybrid'] },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    }
  }

  // `navigator.credentials.get`: the one passkey asked for, or — for a discoverable login with no
  // list — the first one this keychain holds for the site, as the browser's chooser would offer.
  get(options: RequestOptions, { id, origin = this.origin }: { id?: string; origin?: string } = {}): Assertion {
    const rpId = options.rpId ?? new URL(this.origin).hostname
    const allowed = options.allowCredentials?.map((c) => c.id)
    const chosen = id ?? [...this.credentials.entries()].find(([cid, c]) => c.rpId === rpId && (!allowed || allowed.includes(cid)))?.[0]
    const credential = chosen ? this.credentials.get(chosen) : undefined
    if (!chosen || !credential) throw new Error('NotAllowedError: no passkey for this site')
    credential.counter += 1
    const authData = authenticatorData(rpId, FLAGS.UP | FLAGS.UV | FLAGS.BE | FLAGS.BS, credential.counter)
    const clientData = clientDataJSON('webauthn.get', options.challenge, origin)
    const signature = sign('sha256', Buffer.concat([authData, createHash('sha256').update(clientData).digest()]), credential.key)
    return {
      id: chosen,
      rawId: chosen,
      type: 'public-key',
      response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature), userHandle: credential.userHandle },
      clientExtensionResults: {},
      authenticatorAttachment: 'platform',
    }
  }
}

const FLAGS = { UP: 0x01, UV: 0x04, BE: 0x08, BS: 0x10, AT: 0x40 } as const

function authenticatorData(rpId: string, flags: number, counter: number, attested: Buffer = Buffer.alloc(0)): Buffer {
  const count = Buffer.alloc(4)
  count.writeUInt32BE(counter)
  return Buffer.concat([createHash('sha256').update(rpId).digest(), Buffer.from([flags]), count, attested])
}

const clientDataJSON = (type: string, challenge: string, origin: string): Buffer => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))
const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url')
const fromB64u = (text: string): Buffer => Buffer.from(text, 'base64url')

// The part of CBOR a passkey's bytes use: integers, byte and text strings, and maps.
function cbor(value: unknown): Buffer {
  const head = (major: number, n: number): Buffer => {
    if (n < 24) return Buffer.from([(major << 5) | n])
    if (n < 0x100) return Buffer.from([(major << 5) | 24, n])
    const b = Buffer.alloc(3)
    b[0] = (major << 5) | 25
    b.writeUInt16BE(n, 1)
    return b
  }
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value)
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)])
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), Buffer.from(value)])
  if (value instanceof Map) return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])])
  throw new Error(`cbor: ${typeof value}`)
}

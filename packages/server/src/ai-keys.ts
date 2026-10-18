import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { Sql } from 'postgres'

// The key vault (#999, E4, DRIFT §5): a designer's own API key at Anthropic or OpenAI, kept so that
// the server can make the call for her later (#1001) and so that nothing else can.
//
// The key is sealed with AES-256-GCM under a master key that lives in the box's environment
// (`AI_KEY_SECRET`) and nowhere else: not in the database, and so not in its WAL archive in R2 either.
// What is stored is the ciphertext, its nonce, the provider, the last four characters, the chosen
// model and when the key was proved — never the key. A leaked backup leaks no key.
//
// A master key that is missing or has been replaced does not fail anything: every key sealed under
// the old one simply cannot be opened, and is treated as no key at all, so the designer is asked
// for it again. Losing the master key is a nuisance and never a loss of data.
//
// The key is the account's and not a game's, so no game's export ever carries it (G5); and nothing
// here, nor anything that calls it, writes a key to the log (DRIFT §8).

export const AI_PROVIDERS = ['anthropic', 'openai'] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]
export const isAiProvider = (value: unknown): value is AiProvider => AI_PROVIDERS.includes(value as AiProvider)

// One key per account. The profile page shows one key and one provider to choose (#998, A), so a
// key saved for the other provider takes the first one's place: a second key kept out of sight
// would be a key its owner believes is gone.
export type AiKeyRow = {
  account: string
  provider: AiProvider
  // The sealed key with GCM's tag after it.
  ciphertext: Uint8Array
  nonce: Uint8Array
  last4: string
  // null is the provider's standard model, whatever that is when the key is used.
  model: string | null
  verifiedAt: string
  updatedAt: string
}

export type AiKeyStore = {
  put(row: AiKeyRow): Promise<void>
  get(account: string): Promise<AiKeyRow | null>
  setModel(account: string, model: string | null, at: string): Promise<boolean>
  remove(account: string): Promise<void>
}

// What may be said about a key, to its owner and to anyone else: never the key itself.
export type AiKeyDescription = { provider: AiProvider; last4: string; model: string | null; verifiedAt: string }
// The key itself, for the server's own call to the provider and nothing else; held in memory only.
export type OpenedAiKey = { provider: AiProvider; key: string; model: string | null }

// The box was given no master key, so nothing can be sealed.
export class VaultClosedError extends Error {
  constructor() {
    super('no master key: AI keys cannot be saved')
    this.name = 'VaultClosedError'
  }
}

const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

// The master key as the environment writes it: 32 random bytes, in base64 or in hex
// (`openssl rand -base64 32`). Anything else is no master key — and the vault then seals nothing.
export function masterKeyFrom(value: string | undefined): Buffer | null {
  const text = value?.trim() ?? ''
  if (/^[0-9a-f]{64}$/i.test(text)) return Buffer.from(text, 'hex')
  if (!/^[A-Za-z0-9+/]{43}=$/.test(text)) return null
  const bytes = Buffer.from(text, 'base64')
  return bytes.length === KEY_BYTES ? bytes : null
}

// The seal says whose key it is and for which provider, so a row moved to another account or
// relabelled as another provider's opens for nobody.
const boundTo = (account: string, provider: AiProvider): Buffer => Buffer.from(`byd-ai-key:v1:${account}:${provider}`)

export class AiKeyVault {
  constructor(
    private readonly store: AiKeyStore,
    private readonly master: Buffer | null,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // Whether a key can be saved at all on this box.
  get sealing(): boolean {
    return this.master !== null
  }

  async save(account: string, provider: AiProvider, key: string, model: string | null = null): Promise<AiKeyDescription> {
    if (!this.master) throw new VaultClosedError()
    const nonce = randomBytes(NONCE_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.master, nonce)
    cipher.setAAD(boundTo(account, provider))
    const ciphertext = Buffer.concat([cipher.update(key, 'utf8'), cipher.final(), cipher.getAuthTag()])
    const at = this.now().toISOString()
    await this.store.put({ account, provider, ciphertext, nonce, last4: key.slice(-4), model, verifiedAt: at, updatedAt: at })
    return { provider, last4: key.slice(-4), model, verifiedAt: at }
  }

  async describe(account: string): Promise<AiKeyDescription | null> {
    const row = await this.store.get(account)
    return row && this.unseal(row) !== null ? describe(row) : null
  }

  async open(account: string): Promise<OpenedAiKey | null> {
    const row = await this.store.get(account)
    const key = row ? this.unseal(row) : null
    return row && key !== null ? { provider: row.provider, key, model: row.model } : null
  }

  // A key that cannot be opened has no model to change: to its owner there is no key.
  async setModel(account: string, model: string | null): Promise<AiKeyDescription | null> {
    if (!(await this.describe(account))) return null
    await this.store.setModel(account, model, this.now().toISOString())
    return this.describe(account)
  }

  async remove(account: string): Promise<void> {
    await this.store.remove(account)
  }

  private unseal(row: AiKeyRow): string | null {
    if (!this.master || row.nonce.length !== NONCE_BYTES || row.ciphertext.length <= TAG_BYTES) return null
    try {
      const sealed = Buffer.from(row.ciphertext)
      const decipher = createDecipheriv('aes-256-gcm', this.master, Buffer.from(row.nonce))
      decipher.setAAD(boundTo(row.account, row.provider))
      decipher.setAuthTag(sealed.subarray(sealed.length - TAG_BYTES))
      return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - TAG_BYTES)), decipher.final()]).toString('utf8')
    } catch {
      // Another master key, or a row that is not what it was sealed as: no key, never an error.
      return null
    }
  }
}

const describe = (row: AiKeyRow): AiKeyDescription => ({ provider: row.provider, last4: row.last4, model: row.model, verifiedAt: row.verifiedAt })

// In memory, for tests and local play: same contract, no durability.
export class MemoryAiKeyStore implements AiKeyStore {
  private readonly rows = new Map<string, AiKeyRow>()
  async put(row: AiKeyRow): Promise<void> {
    this.rows.set(row.account, structuredClone(row))
  }
  async get(account: string): Promise<AiKeyRow | null> {
    const row = this.rows.get(account)
    return row ? structuredClone(row) : null
  }
  async setModel(account: string, model: string | null, at: string): Promise<boolean> {
    const row = this.rows.get(account)
    if (!row) return false
    row.model = model
    row.updatedAt = at
    return true
  }
  async remove(account: string): Promise<void> {
    this.rows.delete(account)
  }
}

// On the box: the table `ai_keys`, one row per account, gone with the account.
export class PostgresAiKeyStore implements AiKeyStore {
  constructor(private readonly sql: Sql) {}
  async put(row: AiKeyRow): Promise<void> {
    await this.sql`
      insert into ai_keys (account_id, provider, ciphertext, nonce, last4, model, verified_at, updated_at)
      values (${row.account}, ${row.provider}, ${Buffer.from(row.ciphertext)}, ${Buffer.from(row.nonce)}, ${row.last4}, ${row.model}, ${row.verifiedAt}, ${row.updatedAt})
      on conflict (account_id) do update set provider = excluded.provider, ciphertext = excluded.ciphertext, nonce = excluded.nonce,
        last4 = excluded.last4, model = excluded.model, verified_at = excluded.verified_at, updated_at = excluded.updated_at
    `
  }
  async get(account: string): Promise<AiKeyRow | null> {
    const [row] = await this.sql<{ account_id: string; provider: AiProvider; ciphertext: Buffer; nonce: Buffer; last4: string; model: string | null; verified_at: Date; updated_at: Date }[]>`
      select account_id, provider, ciphertext, nonce, last4, model, verified_at, updated_at from ai_keys where account_id = ${account}
    `
    if (!row) return null
    return {
      account: String(row.account_id),
      provider: row.provider,
      ciphertext: new Uint8Array(row.ciphertext),
      nonce: new Uint8Array(row.nonce),
      last4: row.last4,
      model: row.model,
      verifiedAt: row.verified_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    }
  }
  async setModel(account: string, model: string | null, at: string): Promise<boolean> {
    const rows = await this.sql`update ai_keys set model = ${model}, updated_at = ${at} where account_id = ${account} returning account_id`
    return rows.length > 0
  }
  async remove(account: string): Promise<void> {
    await this.sql`delete from ai_keys where account_id = ${account}`
  }
}

// The restore rehearsal's word on the keys (DRIFT §5, `ops/restore-test.sh`): the rows as the restored
// database writes them out, base64 as Postgres's `encode` wraps it, opened with whatever master key
// the rehearsal has — which is never the box's. Every key must read as none: a database brought back
// without its master key asks its designers for their keys again, and is not a database of keys.
export type RestoredKeyRow = { account: string; provider: AiProvider; ciphertext: string; nonce: string; last4: string }
export async function restoredKeysOpened(rows: readonly RestoredKeyRow[], master: Buffer | null): Promise<{ keys: number; opened: number }> {
  const store = new MemoryAiKeyStore()
  const vault = new AiKeyVault(store, master)
  let opened = 0
  for (const row of rows) {
    const bytes = (b64: string) => new Uint8Array(Buffer.from(b64.replace(/\s/g, ''), 'base64'))
    await store.put({ account: row.account, provider: row.provider, ciphertext: bytes(row.ciphertext), nonce: bytes(row.nonce), last4: row.last4, model: null, verifiedAt: '', updatedAt: '' })
    if (await vault.open(row.account)) opened++
  }
  return { keys: rows.length, opened }
}

// Saving a key asks the provider whether it is one (#999). That makes the endpoint a way to try
// keys, so an account gets a handful of tries an hour — enough to fix a bad paste, too few to test
// a list of leaked keys through this server. DRIFT §9's edge limit is the outer wall.
export const KEY_TRIES_PER_HOUR = 10
export class KeyTryLimiter {
  private readonly tries = new Map<string, number[]>()
  constructor(private readonly perHour = KEY_TRIES_PER_HOUR) {}
  allow(account: string, now: number): boolean {
    const recent = (this.tries.get(account) ?? []).filter((t) => now - t < 3600_000)
    if (recent.length >= this.perHour) return false
    recent.push(now)
    this.tries.set(account, recent)
    return true
  }
}

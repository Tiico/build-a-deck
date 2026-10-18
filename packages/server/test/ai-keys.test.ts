import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { AiKeyVault, MemoryAiKeyStore, VaultClosedError, masterKeyFrom, restoredKeysOpened } from '../src/ai-keys.js'

// The key vault (#999, E4, DRIFT §5): a designer's own key at Anthropic or OpenAI, sealed with a
// master key that lives in the box's environment and never in the database or its backups.
const KEY = 'sk-ant-api03-thisIsNotARealKey-0123456789abcdefx7Qd'
const master = () => randomBytes(32)
const at = (iso: string) => () => new Date(iso)

describe('the master key', () => {
  it('is 32 bytes, written as base64 or as hex, and nothing else', () => {
    const bytes = randomBytes(32)
    expect(masterKeyFrom(bytes.toString('base64'))).toEqual(bytes)
    expect(masterKeyFrom(bytes.toString('hex'))).toEqual(bytes)
    expect(masterKeyFrom(` ${bytes.toString('base64')}\n`)).toEqual(bytes)
    for (const wrong of [undefined, '', 'secret', randomBytes(16).toString('base64'), randomBytes(31).toString('hex')]) expect(masterKeyFrom(wrong)).toBeNull()
  })
})

describe('the vault', () => {
  it('opens again what it sealed, and describes it by its provider and last four characters only', async () => {
    const store = new MemoryAiKeyStore()
    const vault = new AiKeyVault(store, master(), at('2026-10-18T09:41:00.000Z'))
    const saved = await vault.save('acc-1', 'anthropic', KEY)
    expect(saved).toEqual({ provider: 'anthropic', last4: 'x7Qd', model: null, verifiedAt: '2026-10-18T09:41:00.000Z' })
    expect(await vault.describe('acc-1')).toEqual(saved)
    expect(await vault.open('acc-1')).toEqual({ provider: 'anthropic', key: KEY, model: null })
    expect(JSON.stringify(await vault.describe('acc-1'))).not.toContain(KEY.slice(0, -4))
  })

  it('keeps no plaintext: the ciphertext does not hold the key, and two seals of one key differ', async () => {
    const store = new MemoryAiKeyStore()
    const vault = new AiKeyVault(store, master())
    await vault.save('acc-1', 'openai', KEY)
    const first = await store.get('acc-1')
    await vault.save('acc-1', 'openai', KEY)
    const second = await store.get('acc-1')
    for (const row of [first!, second!]) {
      const kept = Buffer.from(JSON.stringify({ ...row, ciphertext: Buffer.from(row.ciphertext).toString('latin1'), nonce: Buffer.from(row.nonce).toString('latin1') }))
      expect(kept.includes(KEY)).toBe(false)
      expect(kept.includes(KEY.slice(0, 20))).toBe(false)
      expect(Buffer.from(row.ciphertext).includes(Buffer.from(KEY))).toBe(false)
      expect(row.nonce).toHaveLength(12)
    }
    expect(Buffer.from(first!.ciphertext).equals(Buffer.from(second!.ciphertext))).toBe(false)
  })

  it('treats a key sealed under another master key as no key at all, never as an error', async () => {
    const store = new MemoryAiKeyStore()
    await new AiKeyVault(store, master()).save('acc-1', 'anthropic', KEY)
    const rotated = new AiKeyVault(store, master())
    expect(await rotated.describe('acc-1')).toBeNull()
    expect(await rotated.open('acc-1')).toBeNull()
    expect(await rotated.setModel('acc-1', 'claude-opus-5-5')).toBeNull()
    // And the box that has lost its master key entirely says the same, and saves nothing.
    const without = new AiKeyVault(store, null)
    expect(without.sealing).toBe(false)
    expect(await without.describe('acc-1')).toBeNull()
    expect(await without.open('acc-1')).toBeNull()
    await expect(without.save('acc-1', 'anthropic', KEY)).rejects.toBeInstanceOf(VaultClosedError)
  })

  it('binds the seal to its account and provider, so a row moved to another account opens for nobody', async () => {
    const store = new MemoryAiKeyStore()
    const vault = new AiKeyVault(store, master())
    await vault.save('acc-1', 'anthropic', KEY)
    const row = (await store.get('acc-1'))!
    await store.put({ ...row, account: 'acc-2' })
    expect(await vault.open('acc-2')).toBeNull()
    await store.put({ ...row, provider: 'openai' })
    expect(await vault.open('acc-1')).toBeNull()
  })

  it('keeps one key per account: a key from the other provider takes the place of the first', async () => {
    const vault = new AiKeyVault(new MemoryAiKeyStore(), master())
    await vault.save('acc-1', 'anthropic', KEY)
    await vault.save('acc-1', 'openai', 'sk-proj-anotherKeyThatIsNotRealAbCd')
    expect((await vault.describe('acc-1'))?.provider).toBe('openai')
    expect((await vault.describe('acc-1'))?.last4).toBe('AbCd')
    expect(await vault.describe('acc-2')).toBeNull()
  })

  it('changes the model without touching the key, and forgets everything when removed', async () => {
    const vault = new AiKeyVault(new MemoryAiKeyStore(), master())
    await vault.save('acc-1', 'anthropic', KEY)
    expect((await vault.setModel('acc-1', 'claude-opus-5-5'))?.model).toBe('claude-opus-5-5')
    expect((await vault.open('acc-1'))?.key).toBe(KEY)
    expect((await vault.setModel('acc-1', null))?.model).toBeNull()
    expect(await vault.setModel('nobody', 'x')).toBeNull()
    await vault.remove('acc-1')
    expect(await vault.describe('acc-1')).toBeNull()
    expect(await vault.open('acc-1')).toBeNull()
  })

  it('reads a restored database’s keys as none without the box’s master key (DRIFT §5)', async () => {
    const store = new MemoryAiKeyStore()
    const box = master()
    await new AiKeyVault(store, box).save('1', 'anthropic', KEY)
    await new AiKeyVault(store, box).save('2', 'openai', 'sk-proj-good-another-key-AbCd')
    // As `ops/restore.sh` writes the rows out of the restored database: base64, wrapped as Postgres wraps it.
    const wrapped = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64').replace(/(.{76})/g, '$1\n')
    const rows = await Promise.all(['1', '2'].map(async (account) => {
      const row = (await store.get(account))!
      return { account, provider: row.provider, ciphertext: wrapped(row.ciphertext), nonce: wrapped(row.nonce), last4: row.last4 }
    }))
    expect(await restoredKeysOpened(rows, master())).toEqual({ keys: 2, opened: 0 })
    expect(await restoredKeysOpened(rows, null)).toEqual({ keys: 2, opened: 0 })
    // The check is a real one: the box's own master key opens them.
    expect(await restoredKeysOpened(rows, box)).toEqual({ keys: 2, opened: 2 })
  })

  it('keeps the chosen model through a new key from the same provider, when asked to', async () => {
    const vault = new AiKeyVault(new MemoryAiKeyStore(), master())
    await vault.save('acc-1', 'anthropic', KEY, 'claude-haiku-4-5')
    expect((await vault.describe('acc-1'))?.model).toBe('claude-haiku-4-5')
  })
})

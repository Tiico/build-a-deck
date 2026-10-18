import { randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AiKeyVault, KeyTryLimiter, MemoryAiKeyStore } from '../src/ai-keys.js'
import { providersFromEnv } from '../src/ai-providers.js'
import { MemoryAuthStore } from '../src/auth.js'
import { fakeAiProvider, type FakeAiProvider } from '../../../test-support/fake-ai-provider.js'
import { listenInBand, start, type Running } from './fixture.js'

// The key on the profile page, over the wire (#999): describe it, save it once the provider has
// accepted it, choose a model, take it away. With the account's cookie, and never the key back.
const KEY = 'sk-ant-api03-good-NotARealKey-0123456789abcdefx7Qd'
let fake: FakeAiProvider
let provider: Server
let providerUrl = ''
beforeAll(async () => {
  fake = fakeAiProvider()
  provider = createServer(fake.listener)
  providerUrl = `http://127.0.0.1:${await listenInBand(provider)}`
})
afterAll(async () => {
  provider.closeAllConnections()
  await new Promise<void>((resolve) => provider.close(() => resolve()))
})

let run: Running | null = null
afterEach(async () => {
  await run?.stop()
  run = null
})

type Opts = { master?: Buffer | null; limiter?: KeyTryLimiter }
async function serve(opts: Opts = {}): Promise<{ run: Running; vault: AiKeyVault; store: MemoryAiKeyStore; auth: MemoryAuthStore }> {
  const store = new MemoryAiKeyStore()
  const vault = new AiKeyVault(store, opts.master === undefined ? randomBytes(32) : opts.master)
  const providers = providersFromEnv({ AI_ANTHROPIC_URL: `${providerUrl}/anthropic`, AI_OPENAI_URL: `${providerUrl}/openai` })
  const auth = new MemoryAuthStore()
  run = await start({ auth, ai: { vault, providers, ...(opts.limiter ? { limiter: opts.limiter } : {}) } })
  return { run, vault, store, auth }
}

async function login(r: Running, email = 'ada@example.com'): Promise<string> {
  await fetch(`${r.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const link = /\/auth\/verify\?token=\S+/.exec(r.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  return ((await fetch(`${r.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
}

const call = async (r: Running, cookie: string, method: string, path: string, body?: unknown): Promise<{ status: number; text: string; json: Record<string, unknown> }> => {
  const res = await fetch(`${r.http}${path}`, { method, headers: { cookie, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }) })
  const text = await res.text()
  return { status: res.status, text, json: text ? (JSON.parse(text) as Record<string, unknown>) : {} }
}

describe('the key over the wire', () => {
  it('is the account’s: nobody logged out may describe, save, change or remove one', async () => {
    const { run } = await serve()
    for (const [method, path] of [['GET', '/me/ai-key'], ['PUT', '/me/ai-key'], ['PUT', '/me/ai-key/model'], ['GET', '/me/ai-key/models'], ['DELETE', '/me/ai-key']] as const) {
      expect({ method, path, status: (await call(run, '', method, path, method === 'PUT' ? { provider: 'anthropic', key: KEY, model: null } : undefined)).status }).toEqual({ method, path, status: 401 })
    }
  })

  it('saves a key the provider accepts, describes it without the key, and lists its models', async () => {
    const { run } = await serve()
    const cookie = await login(run)
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json).toEqual({ key: null, sealing: true })

    const saved = await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
    expect(saved.status).toBe(200)
    expect(saved.json['key']).toMatchObject({ provider: 'anthropic', last4: 'x7Qd', model: null, defaultModel: 'claude-sonnet-5-5' })
    expect(saved.json['models']).toEqual([
      { id: 'claude-opus-5-5', name: 'Claude Opus 5.5' },
      { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5' },
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    ])
    expect(fake.calls.at(-1)?.key).toBe(KEY)
    const described = await call(run, cookie, 'GET', '/me/ai-key')
    expect(described.json['key']).toEqual(saved.json['key'])
    const listed = await call(run, cookie, 'GET', '/me/ai-key/models')
    expect(listed.json).toEqual({ models: saved.json['models'], defaultModel: 'claude-sonnet-5-5' })
    for (const text of [saved.text, described.text, listed.text]) expect(text).not.toContain(KEY.slice(0, -4))

    // Another account sees nothing of it.
    expect((await call(run, await login(run, 'bo@example.com'), 'GET', '/me/ai-key')).json['key']).toBeNull()
  })

  it('keeps nothing when the provider says no, and says why in the provider’s closed set of words', async () => {
    const { run } = await serve()
    const cookie = await login(run)
    for (const [key, error] of [['sk-ant-bad-key-000000', 'invalid-key'], ['sk-ant-broke-key-0000', 'no-credit'], ['sk-ant-busy-key-00000', 'rate-limit'], ['sk-ant-swamped-key-00', 'overloaded']] as const) {
      const refused = await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key })
      expect({ key, status: refused.status, body: refused.json }).toEqual({ key, status: 422, body: { error } })
    }
    const openai = await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'openai', key: 'sk-proj-bad-0000000000' })
    expect(openai.json).toEqual({ error: 'invalid-key' })
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json['key']).toBeNull()
  })

  it('leaves the key that was there when a new one is refused', async () => {
    const { run } = await serve()
    const cookie = await login(run)
    await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
    await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'openai', key: 'sk-proj-bad-0000000000' })
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json['key']).toMatchObject({ provider: 'anthropic', last4: 'x7Qd' })
  })

  it('changes the model, keeps it through a new key from the same provider, and drops it for another provider', async () => {
    const { run } = await serve()
    const cookie = await login(run)
    await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
    const chosen = await call(run, cookie, 'PUT', '/me/ai-key/model', { model: 'claude-opus-5-5' })
    expect(chosen.json['key']).toMatchObject({ model: 'claude-opus-5-5' })
    await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: 'sk-ant-api03-good-another-key-AbCd' })
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json['key']).toMatchObject({ last4: 'AbCd', model: 'claude-opus-5-5' })
    const other = await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'openai', key: 'sk-proj-good-key-WxYz' })
    expect(other.json['key']).toMatchObject({ provider: 'openai', last4: 'WxYz', model: null, defaultModel: 'gpt-5' })
    expect((await call(run, cookie, 'PUT', '/me/ai-key/model', { model: null })).json['key']).toMatchObject({ model: null })
    expect((await call(run, cookie, 'PUT', '/me/ai-key/model', { model: 'not a model; drop table' })).status).toBe(400)
  })

  it('forgets the key when it is removed, and has no model to change after that', async () => {
    const { run } = await serve()
    const cookie = await login(run)
    await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
    expect((await call(run, cookie, 'DELETE', '/me/ai-key')).json).toEqual({ key: null })
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json['key']).toBeNull()
    expect((await call(run, cookie, 'PUT', '/me/ai-key/model', { model: 'claude-opus-5-5' })).status).toBe(404)
    expect((await call(run, cookie, 'GET', '/me/ai-key/models')).status).toBe(404)
  })

  it('refuses a body that is not a key without saying it back', async () => {
    const { run } = await serve()
    const cookie = await login(run)
    for (const body of ['{"provider":"anthropic","key":"sk-ant-secret-but-broken', { provider: 'mistral', key: KEY }, { provider: 'anthropic', key: '' }, { provider: 'anthropic', key: 'sk ant with spaces' }]) {
      const refused = await call(run, cookie, 'PUT', '/me/ai-key', body)
      expect(refused.status).toBe(400)
      expect(refused.json).toEqual({ error: 'malformed' })
    }
  })

  it('gives an account a handful of tries an hour, and no more', async () => {
    const { run } = await serve({ limiter: new KeyTryLimiter(3) })
    const cookie = await login(run)
    for (let i = 0; i < 3; i++) expect((await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: 'sk-ant-bad-key-000000' })).status).toBe(422)
    const after = await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
    expect(after.status).toBe(429)
    expect(after.json).toEqual({ error: 'too-many' })
    // Another account has its own tries.
    expect((await call(run, await login(run, 'bo@example.com'), 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })).status).toBe(200)
  })

  it('says it cannot keep a key on a box with no master key, and describes none', async () => {
    const { run } = await serve({ master: null })
    const cookie = await login(run)
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json).toEqual({ key: null, sealing: false })
    const refused = await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
    expect(refused.status).toBe(503)
    expect(refused.json).toEqual({ error: 'unavailable' })
  })

  it('says why the models cannot be listed in the same words, and keeps the key while it does', async () => {
    const { run, vault, auth } = await serve()
    const cookie = await login(run)
    const account = await auth.ensureAccount('ada@example.com')
    // A key the provider has since revoked: saved once, refused now.
    await vault.save(account.id, 'anthropic', 'sk-ant-api03-bad-revoked-since-RvKd')
    const listed = await call(run, cookie, 'GET', '/me/ai-key/models')
    expect({ status: listed.status, body: listed.json }).toEqual({ status: 422, body: { error: 'invalid-key' } })
    expect((await call(run, cookie, 'GET', '/me/ai-key')).json['key']).toMatchObject({ last4: 'RvKd' })
  })

  it('never writes a key to the log, whatever happens to it', async () => {
    const said: string[] = []
    const keep = (...args: unknown[]) => void said.push(args.map(String).join(' '))
    const spies = [vi.spyOn(console, 'log').mockImplementation(keep), vi.spyOn(console, 'error').mockImplementation(keep), vi.spyOn(console, 'warn').mockImplementation(keep), vi.spyOn(console, 'info').mockImplementation(keep)]
    const writes = [vi.spyOn(process.stdout, 'write'), vi.spyOn(process.stderr, 'write')]
    try {
      const { run } = await serve()
      const cookie = await login(run)
      await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: KEY })
      await call(run, cookie, 'GET', '/me/ai-key/models')
      await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: 'sk-ant-bad-LOGME-000' })
      await call(run, cookie, 'PUT', '/me/ai-key', { provider: 'anthropic', key: 'sk-ant-hangup-LOGME-1' })
      await call(run, cookie, 'PUT', '/me/ai-key', '{"provider":"anthropic","key":"sk-ant-LOGME-broken')
      await call(run, cookie, 'DELETE', '/me/ai-key')
      const written = [...said, ...writes.flatMap((w) => w.mock.calls.map((c) => String(c[0])))].join('\n')
      expect(written).not.toContain(KEY.slice(0, 20))
      expect(written).not.toContain('LOGME')
    } finally {
      for (const s of [...spies, ...writes]) s.mockRestore()
    }
  })
})

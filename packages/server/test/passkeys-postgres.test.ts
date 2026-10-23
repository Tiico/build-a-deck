import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore } from '../src/index.js'
import { SoftPasskey } from '../../../test-support/soft-passkey.js'
import { start } from './fixture.js'

// Passkeys as the box keeps them (#1180): in Postgres, saved, used, listed and taken away over the
// wire, and gone with the account. Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']
const schema = `test_passkeys_${process.pid}_${Date.now()}`
const ORIGIN = 'http://test.local'

describe.skipIf(!url)('passkeys in Postgres', () => {
  let store: PostgresLogStore
  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  it('saves a passkey, logs in with it, keeps its counter and last use, and takes it away', async () => {
    const run = await start({ auth: store.auth() })
    try {
      const call = async (method: string, path: string, body?: unknown, cookie?: string) => {
        const res = await fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
        return { status: res.status, json: (await res.json()) as any, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '' }
      }
      await call('POST', '/auth/login', { email: 'ada@example.com' })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''

      const keychain = new SoftPasskey(ORIGIN)
      const options = await call('POST', '/auth/passkeys/register/options', {}, cookie)
      const saved = await call('POST', '/auth/passkeys/register', { response: keychain.create(options.json) }, cookie)
      expect(saved.status).toBe(200)

      // Twice, so the counter the first login wrote is what the second is checked against.
      for (const _ of [1, 2]) {
        const loginOptions = await call('POST', '/auth/passkeys/login/options', {})
        const res = await call('POST', '/auth/passkeys/login', { response: keychain.get(loginOptions.json) })
        expect(res.status).toBe(200)
        expect((await call('GET', '/auth/me', undefined, res.cookie)).json).toEqual({ email: 'ada@example.com' })
      }
      expect((await store.auth().passkey(saved.json.id))?.counter).toBe(2)

      const listed = await call('GET', '/auth/passkeys', undefined, cookie)
      expect(listed.json.passkeys).toEqual([{ id: saved.json.id, keychain: 'icloud', device: expect.any(String), createdAt: saved.json.createdAt, lastUsedAt: expect.any(String) }])

      expect((await call('DELETE', `/auth/passkeys/${saved.json.id}`, undefined, cookie)).status).toBe(200)
      expect(await store.auth().passkey(saved.json.id)).toBeNull()
    } finally {
      await run.stop()
    }
  })
})

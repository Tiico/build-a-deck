import { afterEach, describe, expect, it } from 'vitest'
import { MemoryAuthStore, PostgresLogStore, type AuthStore } from '../src/index.js'
import { TERMS, checkRegister, type TermsRegister } from '../src/terms.js'
import { start, type Running } from './fixture.js'

// The terms' versions and who accepted them (#1270, F4, #1268): a register the box runs with, the
// version in force at `GET /terms`, an account's acceptance at `POST /me/terms`, and where the
// account stands in `GET /auth/me`. The doors it closes are #1272's (`terms-gate.test.ts`).
//
// Against the memory store and against Postgres, which is where the box keeps the acceptances.
// The Postgres half runs only with DATABASE_URL=postgres://... pnpm test.
const url = process.env['DATABASE_URL']
const schema = `test_terms_${process.pid}_${Date.now()}`

type Backend = { auth: AuthStore; close(): Promise<void> }
const backends: { name: string; skip: boolean; open(): Promise<Backend> }[] = [
  { name: 'memory', skip: false, open: async () => ({ auth: new MemoryAuthStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresLogStore.connect(url!, { schema: `${schema}_${Math.random().toString(36).slice(2, 8)}` })
      await store.migrate()
      return {
        auth: store.auth(),
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

for (const backend of backends) {
  describe.skipIf(backend.skip)(`the terms an account has accepted, in ${backend.name} (#1270)`, () => {
    let db: Backend
    let run: Running | undefined
    afterEach(async () => {
      await run?.stop()
      run = undefined
      await db?.close()
    })

    // The server's clock, which says which version is in force.
    let now = new Date()
    const open = async ({ terms, at }: { terms?: TermsRegister; at?: string } = {}) => {
      if (at) now = new Date(at)
      db = await backend.open()
      run = await start({ auth: db.auth, now: () => now, ...(terms ? { terms } : {}) })
      return run
    }
    const call = async (method: string, path: string, body?: unknown, cookie?: string) => {
      const res = await fetch(`${run!.http}${path}`, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' })
      const text = await res.text()
      return { status: res.status, json: text ? (JSON.parse(text) as unknown) : undefined, cookie: (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '' }
    }
    const login = async (email: string): Promise<string> => {
      await call('POST', '/auth/login', { email })
      const link = /\/auth\/verify\?token=\S+/.exec(run!.mail.sent.findLast((m) => m.to === email)?.text ?? '')?.[0] ?? ''
      return (await call('GET', link)).cookie
    }

    it('has no terms with an empty register, which is today, and changes nothing for anyone', async () => {
      await open()
      expect(await call('GET', '/terms')).toMatchObject({ status: 200, json: { current: null } })
      const cookie = await login('ada@example.com')
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ email: 'ada@example.com', terms: { current: null, accepted: null, due: false } })
      // There is nothing to accept, so no version is the one in force.
      expect(await call('POST', '/me/terms', { version: '2026-11-01' }, cookie)).toMatchObject({ status: 409 })
      expect(await db.auth.termsAccepted((await db.auth.accountByEmail('ada@example.com'))!.id)).toEqual([])
    })

    it('records that an account accepted the version in force, once, with when, and never writes over it', async () => {
      await open({ terms: [{ version: '2026-11-01', material: true }], at: '2026-11-05T10:00:00Z' })
      expect(await call('GET', '/terms')).toMatchObject({ status: 200, json: { current: { version: '2026-11-01', material: true } } })
      const cookie = await login('ada@example.com')
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ email: 'ada@example.com', terms: { current: '2026-11-01', accepted: null, due: true } })

      expect(await call('POST', '/me/terms', { version: '2026-11-01' }, cookie)).toEqual({ status: 204, json: undefined, cookie: '' })
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ email: 'ada@example.com', terms: { current: '2026-11-01', accepted: '2026-11-01', due: false } })
      const id = (await db.auth.accountByEmail('ada@example.com'))!.id
      expect(await db.auth.termsAccepted(id)).toEqual([{ version: '2026-11-01', at: '2026-11-05T10:00:00.000Z' }])

      // Accepting it again is no new row and no new time: the first acceptance is the one that stands.
      now = new Date('2026-11-06T08:00:00Z')
      expect((await call('POST', '/me/terms', { version: '2026-11-01' }, cookie)).status).toBe(204)
      expect(await db.auth.termsAccepted(id)).toEqual([{ version: '2026-11-01', at: '2026-11-05T10:00:00.000Z' }])
      // Another account's acceptance is its own.
      const bo = await login('bo@example.com')
      expect((await call('GET', '/auth/me', undefined, bo)).json).toMatchObject({ terms: { accepted: null, due: true } })
    })

    it('refuses any version but the one in force with 409, so a tab from before a change accepts nothing', async () => {
      await open({ terms: [{ version: '2026-11-01', material: true }, { version: '2026-12-01', material: true }], at: '2026-12-05T10:00:00Z' })
      const cookie = await login('ada@example.com')
      expect(await call('POST', '/me/terms', { version: '2026-11-01' }, cookie)).toMatchObject({ status: 409, json: { current: '2026-12-01' } })
      // Nor a version the register has not got, nor one whose day has not come.
      expect((await call('POST', '/me/terms', { version: '2027-01-01' }, cookie)).status).toBe(409)
      expect((await call('POST', '/me/terms', {}, cookie)).status).toBe(400)
      expect(await db.auth.termsAccepted((await db.auth.accountByEmail('ada@example.com'))!.id)).toEqual([])
    })

    it('asks for a login before anything else with 401', async () => {
      await open({ terms: [{ version: '2026-11-01', material: true }], at: '2026-11-05T10:00:00Z' })
      expect(await call('POST', '/me/terms', { version: '2026-11-01' })).toMatchObject({ status: 401 })
      expect((await call('GET', '/auth/me')).json).toEqual({ email: null })
    })

    it('asks again when a later version is material, from its day and not before', async () => {
      await open({ terms: [{ version: '2026-11-01', material: true }, { version: '2027-01-01', material: true }], at: '2026-11-05T10:00:00Z' })
      const cookie = await login('ada@example.com')
      expect((await call('POST', '/me/terms', { version: '2026-11-01' }, cookie)).status).toBe(204)
      // Written into the register ahead of its day, the new version is not yet in force.
      now = new Date('2026-12-31T23:59:00Z')
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ terms: { current: '2026-11-01', accepted: '2026-11-01', due: false } })
      now = new Date('2027-01-01T00:01:00Z')
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ terms: { current: '2027-01-01', accepted: '2026-11-01', due: true } })
      expect((await call('POST', '/me/terms', { version: '2027-01-01' }, cookie)).status).toBe(204)
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ terms: { current: '2027-01-01', accepted: '2027-01-01', due: false } })
      expect((await db.auth.termsAccepted((await db.auth.accountByEmail('ada@example.com'))!.id)).map((a) => a.version)).toEqual(['2026-11-01', '2027-01-01'])
    })

    it('asks nothing again for an editorial version, though it is the one in force', async () => {
      await open({ terms: [{ version: '2026-11-01', material: true }, { version: '2026-12-01', material: false }], at: '2026-11-05T10:00:00Z' })
      const cookie = await login('ada@example.com')
      expect((await call('POST', '/me/terms', { version: '2026-11-01' }, cookie)).status).toBe(204)
      now = new Date('2026-12-02T10:00:00Z')
      expect((await call('GET', '/auth/me', undefined, cookie)).json).toMatchObject({ terms: { current: '2026-12-01', accepted: '2026-11-01', due: false } })
      // An account that has accepted nothing is asked for the version in force, editorial or not.
      const bo = await login('bo@example.com')
      expect((await call('GET', '/auth/me', undefined, bo)).json).toMatchObject({ terms: { current: '2026-12-01', accepted: null, due: true } })
      expect((await call('POST', '/me/terms', { version: '2026-12-01' }, bo)).status).toBe(204)
      expect((await call('GET', '/auth/me', undefined, bo)).json).toMatchObject({ terms: { current: '2026-12-01', accepted: '2026-12-01', due: false } })
    })
  })
}

describe.skipIf(!url)('the acceptances table in Postgres (#1270)', () => {
  it('is made again by every start without touching a row, and an account from before has accepted nothing', async () => {
    const store = PostgresLogStore.connect(url!, { schema: `${schema}_migrate` })
    try {
      await store.migrate()
      const auth = store.auth()
      const before = await auth.ensureAccount('ada@example.com')
      expect(await auth.termsAccepted(before.id)).toEqual([])
      await auth.acceptTerms(before.id, '2026-11-01', '2026-11-05T10:00:00.000Z')
      await store.migrate()
      expect(await auth.termsAccepted(before.id)).toEqual([{ version: '2026-11-01', at: '2026-11-05T10:00:00.000Z' }])
      expect(await auth.termsAccepted((await auth.ensureAccount('bo@example.com')).id)).toEqual([])
    } finally {
      await store.dropSchema()
      await store.close()
    }
  })
})

describe('the register of the terms\' versions (#1270)', () => {
  it('ships in order, with the beta\'s terms (#1272)', () => {
    expect(TERMS.length).toBeGreaterThan(0)
    expect(() => checkRegister(TERMS)).not.toThrow()
  })

  it('refuses a version that is not a day, and versions out of order, which stops the start', async () => {
    expect(() => checkRegister([{ version: '2026-11', material: true }])).toThrow(/not a day/)
    expect(() => checkRegister([{ version: '2026-02-30', material: true }])).toThrow(/not a day/)
    expect(() => checkRegister([{ version: '2026-12-01', material: true }, { version: '2026-11-01', material: true }])).toThrow(/does not come after/)
    expect(() => checkRegister([{ version: '2026-11-01', material: true }, { version: '2026-11-01', material: false }])).toThrow(/does not come after/)
    await expect(start({ terms: [{ version: 'snart', material: true }] })).rejects.toThrow(/not a day/)
  })
})

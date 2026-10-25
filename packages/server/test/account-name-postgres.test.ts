import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresLogStore } from '../src/index.js'
import { start } from './fixture.js'

// The account's own name as the box keeps it (#1254): in Postgres, on the account's row, read with
// who the account is, so it goes wherever the row goes. Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']
const schema = `test_account_name_${process.pid}_${Date.now()}`

describe.skipIf(!url)('the account name in Postgres', () => {
  let store: PostgresLogStore
  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  it('starts with none and unasked, keeps the name it is given, and asks no more', async () => {
    const auth = store.auth()
    const ada = await auth.ensureAccount('ada@example.com')
    expect(ada).toEqual({ id: ada.id, email: 'ada@example.com', name: null, asked: false })
    await auth.setName(ada.id, 'Ada Lovelace 🎲')
    expect(await auth.accountById(ada.id)).toEqual({ id: ada.id, email: 'ada@example.com', name: 'Ada Lovelace 🎲', asked: true })
    expect(await auth.accountByEmail('ada@example.com')).toMatchObject({ name: 'Ada Lovelace 🎲', asked: true })
    expect(await auth.ensureAccount('ada@example.com')).toMatchObject({ name: 'Ada Lovelace 🎲', asked: true })
    expect((await auth.listAccounts()).find((a) => a.id === ada.id)).toMatchObject({ name: 'Ada Lovelace 🎲' })
    // Passed by: no name, and asked all the same.
    const bo = await auth.ensureAccount('bo@example.com')
    await auth.setName(bo.id, null)
    expect(await auth.accountById(bo.id)).toMatchObject({ name: null, asked: true })
  })

  it('is read with the session, over the wire, after the link', async () => {
    const run = await start({ auth: store.auth() })
    try {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'cy@example.com', next: '/' }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const followed = await fetch(`${run.http}${link}`, { redirect: 'manual' })
      expect(followed.headers.get('location')).toBe('/login?step=name&next=%2F')
      const cookie = (followed.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      const put = await fetch(`${run.http}/me/name`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ name: 'Cy' }) })
      expect(put.status).toBe(200)
      expect(await (await fetch(`${run.http}/auth/me`, { headers: { cookie } })).json()).toMatchObject({ email: 'cy@example.com', name: 'Cy', asked: true })
    } finally {
      await run.stop()
    }
  })
})

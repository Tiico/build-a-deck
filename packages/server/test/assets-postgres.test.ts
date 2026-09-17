import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { MemoryObjectStore } from '@byd/render'
import { PostgresLogStore } from '../src/index.js'
import { assetHash } from '../src/assets.js'
import { start } from './fixture.js'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'

vi.setConfig({ testTimeout: PG_TEST_BUDGET })

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']
const schema = `test_assets_${process.pid}_${Date.now()}`
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])

describe.skipIf(!url)('PostgresAssetStore', () => {
  let store: PostgresLogStore
  beforeAll(async () => {
    store = PostgresLogStore.connect(url!, { schema })
    await store.migrate()
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  it('keeps the bytes in the database without an object store, and only the fact of them with one', async () => {
    const inDb = store.assets()
    const hash = await inDb.put(PNG, 'image/png')
    expect(hash).toBe(assetHash(PNG))
    expect(await inDb.put(PNG, 'image/png')).toBe(hash)
    expect(await inDb.get(hash)).toEqual({ bytes: PNG, contentType: 'image/png' })
    expect(await inDb.link(hash, 60)).toBeNull()

    const objects = new MemoryObjectStore()
    const inR2 = store.assets(objects)
    const other = new Uint8Array([1, 2, 3, 4])
    const h2 = await inR2.put(other, 'image/webp')
    expect(await objects.get(`assets/${h2}`)).toEqual(other)
    expect(await inR2.get(h2)).toEqual({ bytes: other, contentType: 'image/webp' })
    expect(await inR2.get('0'.repeat(64))).toBeNull()
  })

  // The gate is the route's and not the store's, but what a store keeps is what a reader is later
  // served, so the whole way through is asked of the store that runs on the box as well (#204).
  it('puts the type read out of the bytes in the database, and never takes a file that is not one of the formats', async () => {
    const run = await start({ assets: store.assets() })
    try {
      await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
      const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
      const cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''

      // A JPEG that calls itself a PNG is stored, and served, as the JPEG it is.
      const res = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: JPEG })
      expect(res.status).toBe(201)
      const { hash } = (await res.json()) as { hash: string }
      expect(await store.assets().get(hash)).toEqual({ bytes: JPEG, contentType: 'image/jpeg' })
      expect((await fetch(`${run.http}/assets/${hash}`)).headers.get('content-type')).toBe('image/jpeg')

      const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')
      const refused = await fetch(`${run.http}/assets`, { method: 'POST', headers: { 'content-type': 'image/png', cookie }, body: html })
      expect(refused.status).toBe(415)
      // Refused means nothing was written: the database has no row for those bytes at all.
      expect(await store.assets().get(assetHash(html))).toBeNull()
    } finally {
      await run.stop()
    }
  })
})

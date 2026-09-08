import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryObjectStore } from '@byd/render'
import { PostgresLogStore } from '../src/index.js'
import { assetHash } from '../src/assets.js'

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']
const schema = `test_assets_${process.pid}_${Date.now()}`
const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9])

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
})

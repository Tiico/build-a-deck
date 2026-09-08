import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresRenderStore } from '../src/store-postgres.js'
import type { RenderRequest } from '../src/store.js'
import { MemoryObjectStore } from '../src/objects.js'
import postgres from 'postgres'

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
// In a schema of its own, so a stack running against the same database never takes its jobs.
const url = process.env['DATABASE_URL']
const schema = `test_render_${process.pid}_${Date.now()}`

describe.skipIf(!url)('PostgresRenderStore', () => {
  let store: PostgresRenderStore
  const tag = Date.now()
  const req = (id: string, priority: 'texture' | 'print', at: number): RenderRequest => ({
    hash: `${tag}-${id}`,
    kind: priority === 'print' ? { kind: 'pdf' } : { kind: 'png', dpi: 150 },
    priority,
    compiled: { html: `<div>${id}</div>`, css: '' },
    requestedAt: at,
  })

  beforeAll(async () => {
    store = PostgresRenderStore.connect(url!, undefined, { schema })
    await store.migrate()
  })
  afterAll(async () => {
    await store.dropSchema()
    await store.close()
  })

  it('queues, claims in priority order, completes with the output stored, and caches by hash', async () => {
    expect(await store.enqueue(req('p', 'print', 1))).toBe('queued')
    expect(await store.enqueue(req('t', 'texture', 2))).toBe('queued')
    expect(await store.enqueue(req('t', 'texture', 3))).toBe('queued-already')
    const first = await store.claim(10)
    expect(first?.hash).toBe(`${tag}-t`)
    await store.complete(first!.hash, new Uint8Array([9, 9]))
    expect(await store.output(`${tag}-t`)).toEqual(new Uint8Array([9, 9]))
    expect(await store.enqueue(req('t', 'texture', 4))).toBe('cached')
    expect((await store.claim(11))?.hash).toBe(`${tag}-p`)
  })

  it('fails, retries and reaps', async () => {
    await store.fail(`${tag}-p`, 'boom')
    expect(await store.status(`${tag}-p`)).toMatchObject({ state: 'failed', error: 'boom' })
    expect(await store.enqueue(req('p', 'print', 5))).toBe('queued')
    const job = await store.claim(20)
    expect(job?.hash).toBe(`${tag}-p`)
    expect(await store.reap(1000, 20 + 1001)).toEqual([`${tag}-p`])
    expect((await store.claim(30_000))?.hash).toBe(`${tag}-p`)
  })

  // Parity with MemoryRenderStore: the one way back from `failed` (#10).
  it('requeues a failed job when asked, and leaves every other state alone', async () => {
    await store.fail(`${tag}-p`, 'boom')
    expect(await store.requeue(`${tag}-p`)).toBe(true)
    expect(await store.status(`${tag}-p`)).toEqual({ state: 'queued' })
    expect(await store.requeue(`${tag}-p`)).toBe(false)
    expect(await store.requeue(`${tag}-nothing`)).toBe(false)
  })
})

describe.skipIf(!url)('PostgresRenderStore with an object store (DRIFT §4)', () => {
  it('puts the output in the object store with its content type, keeps no bytes in Postgres, and links to it', async () => {
    const objects = new MemoryObjectStore()
    const links: string[] = []
    const linking = { put: objects.put.bind(objects), get: objects.get.bind(objects), check: objects.check.bind(objects), link: async (key: string, ttl: number) => (links.push(`${key}:${ttl}`), `https://r2.test/${key}`) }
    // Its own schema too: the first describe drops its own when it is done.
    const own = `${schema}_r2`
    const sql = postgres(url!, { max: 2, onnotice: () => undefined, connection: { search_path: own } })
    const store = PostgresRenderStore.connect(url!, linking, { schema: own })
    const tag = `${Date.now()}-r2`
    try {
      await store.migrate()
      await store.enqueue({ hash: `${tag}-png`, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: '<i/>', css: '' }, requestedAt: 1 })
      await store.enqueue({ hash: `${tag}-pdf`, kind: { kind: 'pdf' }, priority: 'print', compiled: { html: '<i/>', css: '' }, requestedAt: 2 })
      await store.complete((await store.claim(3))!.hash, new Uint8Array([1]))
      await store.complete((await store.claim(4))!.hash, new Uint8Array([2]))
      expect(await objects.get(`renders/${tag}-png`)).toEqual(new Uint8Array([1]))
      expect(await objects.get(`renders/${tag}-pdf`)).toEqual(new Uint8Array([2]))
      const rows = await sql<{ hash: string; bytes: Uint8Array | null }[]>`select hash, bytes from render_outputs where hash like ${tag + '%'}`
      expect(rows.map((r) => r.bytes)).toEqual([null, null])
      expect(await store.output(`${tag}-png`)).toEqual(new Uint8Array([1]))
      expect(await store.status(`${tag}-png`)).toEqual({ state: 'done', startedAt: 3 })
      expect(await store.enqueue({ hash: `${tag}-png`, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: '<i/>', css: '' }, requestedAt: 5 })).toBe('cached')
      expect(await store.link(`${tag}-png`, 600)).toBe(`https://r2.test/renders/${tag}-png`)
      expect(links).toEqual([`renders/${tag}-png:600`])
      expect(await store.link(`${tag}-nope`, 600)).toBeNull()
      // A store without an object store keeps the bytes in Postgres and has nothing to link to.
      const plain = new PostgresRenderStore(sql)
      await plain.enqueue({ hash: `${tag}-plain`, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: '<i/>', css: '' }, requestedAt: 6 })
      await plain.complete((await plain.claim(7))!.hash, new Uint8Array([3]))
      expect(await plain.output(`${tag}-plain`)).toEqual(new Uint8Array([3]))
      expect(await plain.link(`${tag}-plain`, 600)).toBeNull()
    } finally {
      await sql.end()
      await store.dropSchema()
      await store.close()
    }
  })
})

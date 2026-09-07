import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PostgresRenderStore } from '../src/store-postgres.js'
import type { RenderRequest } from '../src/store.js'

// Runs only against a real Postgres: DATABASE_URL=postgres://... pnpm test
const url = process.env['DATABASE_URL']

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
    store = PostgresRenderStore.connect(url!)
    await store.migrate()
  })
  afterAll(async () => {
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

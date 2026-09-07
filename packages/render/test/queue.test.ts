import { describe, expect, it } from 'vitest'
import { MemoryRenderStore, type RenderRequest } from '../src/store.js'
import { MemoryObjectStore } from '../src/objects.js'

const req = (id: string, priority: 'texture' | 'print', at: number): RenderRequest => ({
  hash: `h-${id}`,
  kind: priority === 'print' ? { kind: 'pdf' } : { kind: 'png', dpi: 150 },
  priority,
  compiled: { html: `<div>${id}</div>`, css: '' },
  requestedAt: at,
})

describe('render queue (DRIFT §6)', () => {
  it('hands out textures before prints, oldest first, and never the same job twice', async () => {
    const q = new MemoryRenderStore()
    await q.enqueue(req('p1', 'print', 1))
    await q.enqueue(req('t1', 'texture', 2))
    await q.enqueue(req('t2', 'texture', 3))
    expect((await q.claim(10))?.hash).toBe('h-t1')
    expect((await q.claim(10))?.hash).toBe('h-t2')
    expect((await q.claim(10))?.hash).toBe('h-p1')
    expect(await q.claim(10)).toBeNull()
  })

  it('a hash that is already rendered or queued is not queued again', async () => {
    const q = new MemoryRenderStore()
    expect(await q.enqueue(req('a', 'texture', 1))).toBe('queued')
    expect(await q.enqueue(req('a', 'texture', 2))).toBe('queued-already')
    const job = await q.claim(5)
    await q.complete(job!.hash, new Uint8Array([1, 2, 3]))
    expect(await q.enqueue(req('a', 'texture', 3))).toBe('cached')
    expect(await q.output('h-a')).toEqual(new Uint8Array([1, 2, 3]))
    expect(await q.claim(6)).toBeNull()
  })

  it('a failed job records why and can be retried; a stuck job is reaped back into the queue', async () => {
    const q = new MemoryRenderStore()
    await q.enqueue(req('a', 'texture', 1))
    const job = await q.claim(5)
    await q.fail(job!.hash, 'chromium died')
    expect(await q.status('h-a')).toMatchObject({ state: 'failed', error: 'chromium died' })
    expect(await q.enqueue(req('a', 'texture', 6))).toBe('queued')

    await q.claim(7)
    expect(await q.claim(8)).toBeNull()
    expect(await q.reap(60_000, 7 + 60_001)).toEqual(['h-a'])
    expect((await q.claim(9 + 60_001))?.hash).toBe('h-a')
  })
})

describe('outputs in an object store (DRIFT §4)', () => {
  it('keeps outputs in the object store under the hash, and links to them when the store can', async () => {
    const objects = new MemoryObjectStore()
    const linking = { ...objects, put: objects.put.bind(objects), get: objects.get.bind(objects), check: objects.check.bind(objects), link: async (key: string, ttl: number) => `https://r2.test/${key}?ttl=${ttl}` }
    const q = new MemoryRenderStore(linking)
    await q.enqueue(req('a', 'texture', 1))
    const job = await q.claim(5)
    await q.complete(job!.hash, new Uint8Array([1, 2, 3]))
    expect(await objects.get('renders/h-a')).toEqual(new Uint8Array([1, 2, 3]))
    expect(await q.output('h-a')).toEqual(new Uint8Array([1, 2, 3]))
    expect(await q.link('h-a', 60)).toBe('https://r2.test/renders/h-a?ttl=60')
    expect(await q.link('h-missing', 60)).toBeNull()
    expect(await new MemoryRenderStore().link('h-a', 60)).toBeNull()
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Renderer } from '../src/renderer.js'
import { MemoryRenderStore } from '../src/store.js'
import { contentHash } from '../src/hash.js'
import { runWorker } from '../src/worker.js'
import { compiled, pngSize } from './fixture.js'

let renderer: Renderer
beforeAll(async () => {
  renderer = await Renderer.launch()
}, 60_000)
afterAll(async () => {
  await renderer.close()
}, 60_000)

describe('runWorker', () => {
  it('drains the queue: textures as PNG, prints as PDF, each stored under its hash', async () => {
    const store = new MemoryRenderStore()
    const card = compiled({ title: 'Drake', body: 'Text.' })
    const png = contentHash(card, { kind: 'png', dpi: 150 })
    const pdf = contentHash(card, { kind: 'pdf' })
    await store.enqueue({ hash: pdf, kind: { kind: 'pdf' }, priority: 'print', compiled: card, requestedAt: 1 })
    await store.enqueue({ hash: png, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: card, requestedAt: 2 })

    const done = await runWorker({ store, renderer, until: 'empty' })
    expect(done).toEqual([png, pdf])
    expect(pngSize((await store.output(png))!).w).toBeGreaterThan(300)
    expect(Buffer.from((await store.output(pdf))!).subarray(0, 4).toString()).toBe('%PDF')
  }, 30_000)

  it('records a failure and moves on', async () => {
    const store = new MemoryRenderStore()
    const bad = { html: '<div>no card here</div>', css: '' }
    const good = compiled({ title: 'x', body: '' })
    await store.enqueue({ hash: 'bad', kind: { kind: 'png', dpi: 96 }, priority: 'texture', compiled: bad, requestedAt: 1 })
    await store.enqueue({ hash: 'good', kind: { kind: 'png', dpi: 96 }, priority: 'texture', compiled: good, requestedAt: 2 })
    expect(await runWorker({ store, renderer, until: 'empty' })).toEqual(['good'])
    expect(await store.status('bad')).toMatchObject({ state: 'failed', error: expect.stringMatching(/data-card/) })
  }, 30_000)
})

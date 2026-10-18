import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Renderer } from '../src/renderer.js'
import { MemoryRenderStore } from '../src/store.js'
import { contentHash } from '../src/hash.js'
import { runWorker } from '../src/worker.js'
import { createHash } from 'node:crypto'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import { compile } from '@byd/template'
import { compiled, face, pngPixel, pngSize } from './fixture.js'

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
    // The texture keeps what its smallest text was fitted to (#523); a print has no reader to size for.
    const smallest = Math.min(...(await renderer.fit(card)).filter((f) => !f.empty).map((f) => f.sizePt))
    expect(await store.fitOf(png)).toEqual({ smallestPt: smallest })
    expect(await store.fitOf(pdf)).toEqual({ smallestPt: null })
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

// The page names its pictures and typefaces by the hash of their bytes (#1028, DRIFT §4), and the
// worker reads the bytes itself. A page of 308 illustrated cards in two uploaded typefaces used to
// carry them all as data URLs through the app, Postgres and the queue, ~1.4 MB a page.
describe('a page that points at its pictures by hash (#1028)', () => {
  const RED = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#f00"/></svg>')
  const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  const pictured = (art: string) =>
    compile({ type: CARD_STANDARD_63x88, face: { ...face, base: [...face.base, { kind: 'image', id: 'art', x: 0, y: 0, w: 63, h: 88, bind: { field: 'art' } }] }, row: { title: '', body: '', art }, icons: {} })
  const mm = (v: number) => Math.round((v / 25.4) * 150)
  const texture = async (store: MemoryRenderStore, page: { html: string; css: string }) => {
    const hash = contentHash(page, { kind: 'png', dpi: 150 })
    await store.enqueue({ hash, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: page, requestedAt: 1 })
    return hash
  }

  it('draws the picture the hash names, read out of the asset store', async () => {
    const store = new MemoryRenderStore()
    const hash = hashOf(RED)
    const job = await texture(store, pictured(`asset:${hash}`))
    const read: string[] = []
    const assets = {
      get: async (h: string) => {
        read.push(h)
        return h === hash ? { bytes: RED, contentType: 'image/svg+xml' } : null
      },
    }

    expect(await runWorker({ store, renderer, assets, until: 'empty' })).toEqual([job])
    expect(pngPixel((await store.output(job))!, mm(31.5), mm(60))).toMatchObject({ r: 255, g: 0, b: 0 })
    expect(read).toEqual([hash])
  }, 30_000)

  it('reads a picture once for every card drawn from it', async () => {
    const store = new MemoryRenderStore()
    const hash = hashOf(RED)
    const one = await texture(store, pictured(`asset:${hash}`))
    const two = await texture(store, compile({ type: CARD_STANDARD_63x88, face: { ...face, base: [{ kind: 'image', id: 'art', x: 0, y: 0, w: 63, h: 88, bind: { field: 'art' } }, ...face.base] }, row: { title: 'Två', body: '', art: `asset:${hash}` }, icons: {} }))
    let reads = 0
    const assets = { get: async () => (reads++, { bytes: RED, contentType: 'image/svg+xml' }) }

    expect(await runWorker({ store, renderer, assets, until: 'empty' })).toEqual([one, two])
    expect(reads).toBe(1)
  }, 30_000)

  it('fails the job, naming the picture, when the store has no such asset — rather than keep a texture without it', async () => {
    const store = new MemoryRenderStore()
    const gone = '0'.repeat(64)
    const job = await texture(store, pictured(`asset:${gone}`))

    expect(await runWorker({ store, renderer, assets: { get: async () => null }, until: 'empty' })).toEqual([])
    expect(await store.status(job)).toMatchObject({ state: 'failed', error: expect.stringContaining(gone) })
    expect(await store.output(job)).toBeNull()
    // And a worker with nowhere to read assets from says so, rather than drawing an empty frame.
    const again = await texture(store, pictured(`asset:${hashOf(RED)}`))
    expect(await runWorker({ store, renderer, until: 'empty' })).toEqual([])
    expect(await store.status(again)).toMatchObject({ state: 'failed', error: expect.stringMatching(/assets/) })
  }, 30_000)
})

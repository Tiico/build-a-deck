import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { createFakeClassifier, FAKE_CLASSIFIER, type Classifier, type Pixels } from '@byd/screening'
import { Renderer } from '../src/renderer.js'
import { MemoryRenderStore } from '../src/store.js'
import { runWorker } from '../src/worker.js'
import { screenRequest } from '../src/screen.js'
import type { AssetBytes } from '../src/assets.js'
import { compiled, pngSize } from './fixture.js'

// A screening through the worker (F4, #1271): the worker reads the picture's bytes as it does a
// card's (DRIFT §4), draws it in Chromium at most 512 px across, svg too, and hands the pixels to
// the classifier the job names. What comes out is a result per picture and version, not a picture.

let renderer: Renderer
beforeAll(async () => {
  renderer = await Renderer.launch()
}, 60_000)
afterAll(async () => {
  await renderer.close()
}, 60_000)

const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const svg = (attrs: string, fill: string) => new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="100%" height="100%" fill="${fill}"/></svg>`)

// The fake, with what it was shown written down: the size is the worker's to decide.
function watching(): { classifier: Classifier; seen: { width: number; height: number }[] } {
  const fake = createFakeClassifier()
  const seen: { width: number; height: number }[] = []
  return { seen, classifier: { ...FAKE_CLASSIFIER, classify: (p: Pixels) => (seen.push({ width: p.width, height: p.height }), fake.classify(p)) } }
}

// Screens every picture named, with the classifiers the worker has; a name without bytes is a
// picture the store does not have.
async function screen(files: Record<string, AssetBytes | null>, classifiers: readonly Classifier[] = [watching().classifier]) {
  const store = new MemoryRenderStore()
  const jobs: Record<string, string> = {}
  let at = 1
  for (const hash of Object.keys(files)) {
    const job = screenRequest(hash, FAKE_CLASSIFIER, at++)
    await store.enqueue(job)
    jobs[hash] = job.hash
  }
  const done = await runWorker({ store, renderer, classifiers, assets: { get: async (h) => files[h] ?? null }, until: 'empty', now: () => 1_000 })
  return { store, jobs, done }
}

describe('screening i renderworkern', () => {
  it('ritar en svg utan egen storlek till 512 px och sparar klassificerarens svar under bilden och versionen', async () => {
    const red = svg('viewBox="0 0 30 40"', '#e01010')
    const asset = hashOf(red)
    const { classifier, seen } = watching()
    const { store, jobs, done } = await screen({ [asset]: { bytes: red, contentType: 'image/svg+xml' } }, [classifier])

    expect(done).toEqual([jobs[asset]])
    expect(seen).toEqual([{ width: 384, height: 512 }])
    const result = await store.screeningOf(asset, FAKE_CLASSIFIER)
    expect(result).toMatchObject({ asset, classifier: FAKE_CLASSIFIER, screenedAt: 1_000, scores: { sexual: 0, violence: 1 }, imageHash: { algorithm: 'dhash-64' } })
    expect(await store.output(jobs[asset]!)).toBeNull()
  }, 30_000)

  it('ritar en svg med egen storlek i sin form, längsta sidan 512 px', async () => {
    const tall = svg('width="10" height="20"', '#20a020')
    const asset = hashOf(tall)
    const { classifier, seen } = watching()
    await screen({ [asset]: { bytes: tall, contentType: 'image/svg+xml' } }, [classifier])
    expect(seen).toEqual([{ width: 256, height: 512 }])
  }, 30_000)

  it('krymper en stor rasterbild till 512 px och förstorar aldrig en liten', async () => {
    const big = await renderer.renderPng(compiled({ title: 'Drake', body: 'Text.' }), { dpi: 300 })
    const small = await renderer.renderPng(compiled({ title: 'Drake', body: 'Text.' }), { dpi: 40 })
    const { w, h } = pngSize(big)
    expect(h).toBeGreaterThan(512)
    const { classifier, seen } = watching()
    const files = { [hashOf(big)]: { bytes: big, contentType: 'image/png' }, [hashOf(small)]: { bytes: small, contentType: 'image/png' } }
    const { store } = await screen(files, [classifier])

    const shrunk = seen.find((s) => s.height === 512)
    expect(shrunk?.width).toBe(Math.round((w * 512) / h))
    expect(seen).toContainEqual({ width: pngSize(small).w, height: pngSize(small).h })
    expect(await store.screenings(FAKE_CLASSIFIER)).toHaveLength(2)
  }, 30_000)

  it('låter en bild som inte går att avkoda bli ett misslyckat jobb med hashen i felet, inte ett resultat', async () => {
    const broken = new TextEncoder().encode('this is not a picture')
    const asset = hashOf(broken)
    const gone = '0'.repeat(64)
    const { store, jobs, done } = await screen({ [asset]: { bytes: broken, contentType: 'image/png' }, [gone]: null })

    expect(done).toEqual([])
    expect(await store.status(jobs[asset]!)).toMatchObject({ state: 'failed', error: expect.stringContaining(asset) })
    expect(await store.status(jobs[gone]!)).toMatchObject({ state: 'failed', error: expect.stringContaining(gone) })
    expect(await store.screeningOf(asset, FAKE_CLASSIFIER)).toBeNull()
    expect((await store.screeningFailures(FAKE_CLASSIFIER)).map((f) => f.asset).sort()).toEqual([gone, asset].sort())
  }, 30_000)

  it('låter ett jobb för en klassificerare som workern inte har misslyckas och säga vilken', async () => {
    const red = svg('viewBox="0 0 1 1"', '#e01010')
    const asset = hashOf(red)
    const { store, jobs } = await screen({ [asset]: { bytes: red, contentType: 'image/svg+xml' } }, [{ ...createFakeClassifier(), version: '2' }])
    expect(await store.status(jobs[asset]!)).toMatchObject({ state: 'failed', error: expect.stringContaining('fake@1') })
  }, 30_000)
})

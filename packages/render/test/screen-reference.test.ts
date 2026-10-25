import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { BOX_CLASSIFIER, createBoxClassifier, matchReference, PDQ_MATCH_DISTANCE, type ScreeningReference } from '@byd/screening'
import { Renderer } from '../src/renderer.js'
import { MemoryRenderStore } from '../src/store.js'
import { runWorker } from '../src/worker.js'
import { screenRequest } from '../src/screen.js'
import type { AssetBytes } from '../src/assets.js'

// The reference list against real pictures, the whole way (F4, beslut 9; #1273): the bytes drawn by
// Chromium in the worker as an upload is, hashed by the box's classifier, and compared with the
// list. A picture on the list is found again when it comes back smaller and saved as a JPEG; a
// card picture of its own is not.

let renderer: Renderer
beforeAll(async () => {
  renderer = await Renderer.launch()
}, 60_000)
afterAll(async () => {
  await renderer.close()
}, 60_000)

// Card art of a kind: a ground, a disc, a slanted band and a frame, in the colours given.
const art = (ground: [string, string], disc: string, band: string, discAt: [number, number]) => ({
  html: `<div data-card style="position:relative;width:300px;height:420px;overflow:hidden;background:linear-gradient(135deg,${ground[0]},${ground[1]})">
    <div style="position:absolute;left:${discAt[0]}px;top:${discAt[1]}px;width:150px;height:150px;border-radius:50%;background:${disc}"></div>
    <div style="position:absolute;left:120px;top:250px;width:200px;height:70px;background:${band};transform:rotate(18deg)"></div>
    <div style="position:absolute;inset:12px;border:6px solid #f4ead8"></div>
  </div>`,
  css: '',
})

const hashOf = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

describe('referenslistan mot riktiga bilder (#1273)', () => {
  it('känner igen en bild ur listan också omskalad och omkodad, och inte en annan kortbild', async () => {
    const listed = art(['#1b3a5c', '#e8b04a'], '#7a1f1f', '#2f6b3a', [40, 80])
    const original = await renderer.renderRaster(listed, { format: 'png', widthPx: 600, heightPx: 840 })
    const copy = await renderer.renderRaster(listed, { format: 'jpg', widthPx: 250, heightPx: 350 })
    const other = await renderer.renderRaster(art(['#f0e6d2', '#5a2a6e'], '#1d5c8f', '#c9452b', [130, 40]), { format: 'png', widthPx: 600, heightPx: 840 })

    const files: Record<string, AssetBytes> = {
      [hashOf(original)]: { bytes: original, contentType: 'image/png' },
      [hashOf(copy)]: { bytes: copy, contentType: 'image/jpeg' },
      [hashOf(other)]: { bytes: other, contentType: 'image/png' },
    }
    const store = new MemoryRenderStore()
    for (const hash of Object.keys(files)) await store.enqueue(screenRequest(hash, BOX_CLASSIFIER, 1))
    await runWorker({ store, renderer, classifiers: [createBoxClassifier()], assets: { get: async (h) => files[h] ?? null }, until: 'empty', now: () => 2 })

    const screened = async (bytes: Uint8Array) => {
      const result = await store.screeningOf(hashOf(bytes), BOX_CLASSIFIER)
      if (!result) throw new Error(`${hashOf(bytes)} was not screened`)
      return result
    }
    const list: ScreeningReference[] = [{ imageHash: { ...(await screened(original)).imageHash, algorithm: 'pdq-256' }, source: 'borttagen i testet', addedAt: 3 }]

    const found = matchReference((await screened(copy)).imageHash, list)
    expect(found?.reference.source).toBe('borttagen i testet')
    expect(found?.distance).toBeLessThanOrEqual(PDQ_MATCH_DISTANCE)
    expect(matchReference((await screened(other)).imageHash, list)).toBeNull()
  }, 120_000)
})

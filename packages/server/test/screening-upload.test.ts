import { afterEach, describe, expect, it } from 'vitest'
import { MemoryRenderStore, type RenderRequest } from '@byd/render/queue'
import { FAKE_CLASSIFIER } from '@byd/screening'
import { assetHash } from '../src/assets.js'
import { start, type Running } from './fixture.js'

// Screening in shadow mode at the upload (F4, beslut 10; #1273): every new picture is queued for the
// render worker's classifier, in the background, and nothing waits for it, is stopped by it, or is
// told of it. A queue that refuses or never answers changes nothing about the upload.

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])
const OTHER_PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 4, 5, 6])
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><rect width="4" height="4" fill="#123"/></svg>')
const WOFF2 = new Uint8Array([...new TextEncoder().encode('wOF2'), 0, 1, 0, 0])

let run: Running | undefined
afterEach(async () => {
  await run?.stop()
  run = undefined
})

async function loggedIn(opts: Parameters<typeof start>[0]): Promise<{ run: Running; upload: (bytes: Uint8Array<ArrayBuffer>, type: string) => Promise<Response> }> {
  const r = await start(opts)
  run = r
  await fetch(`${r.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
  const link = /\/auth\/verify\?token=\S+/.exec(r.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  const cookie = ((await fetch(`${r.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
  return { run: r, upload: (bytes, type) => fetch(`${r.http}/assets`, { method: 'POST', headers: { 'content-type': type, cookie }, body: bytes }) }
}

// What the queue was asked for, and what it holds.
function watched(): { renders: MemoryRenderStore; asked: RenderRequest[] } {
  const renders = new MemoryRenderStore()
  const asked: RenderRequest[] = []
  const enqueue = renders.enqueue.bind(renders)
  renders.enqueue = (req, bearer) => (asked.push(req), enqueue(req, bearer))
  return { renders, asked }
}

const screenedAssets = async (renders: MemoryRenderStore): Promise<string[]> => {
  const assets: string[] = []
  for (let job = await renders.claim(1); job; job = await renders.claim(1)) if (job.kind.kind === 'screen') assets.push(job.kind.asset)
  return assets.sort()
}

describe('screening vid uppladdning, i skuggläge (#1273)', () => {
  it('köar exakt ett screeningjobb per ny bild, svg med, i den klassificerare servern screenar med, och inget för ett typsnitt', async () => {
    const { renders, asked } = watched()
    const { upload } = await loggedIn({ renders, screening: { classifier: FAKE_CLASSIFIER } })
    for (const [bytes, type] of [[PNG, 'image/png'], [PNG, 'image/png'], [OTHER_PNG, 'image/png'], [SVG, 'image/svg+xml'], [WOFF2, 'font/woff2']] as const) expect((await upload(bytes, type)).status).toBe(201)
    await expect.poll(() => asked.length).toBe(4)

    expect(asked.every((r) => r.kind.kind === 'screen' && r.kind.classifier.id === FAKE_CLASSIFIER.id && r.kind.classifier.version === FAKE_CLASSIFIER.version && r.priority === 'screen')).toBe(true)
    // The same bytes twice are one job: the queue is keyed by the picture and the version.
    expect(await screenedAssets(renders)).toEqual([assetHash(PNG), assetHash(OTHER_PNG), assetHash(SVG)].sort())
  })

  it('svarar på uppladdningen fast kön aldrig svarar, och fast den vägrar', async () => {
    for (const answer of [() => new Promise<never>(() => undefined), () => Promise.reject(new Error('the queue is down'))]) {
      const renders = new MemoryRenderStore()
      let asked = 0
      renders.enqueue = () => (asked++, answer())
      const { upload, run: r } = await loggedIn({ renders, screening: { classifier: FAKE_CLASSIFIER } })
      const res = await upload(PNG, 'image/png')
      expect(res.status).toBe(201)
      expect(((await res.json()) as { hash: string }).hash).toBe(assetHash(PNG))
      expect(asked).toBe(1)
      await r.stop()
      run = undefined
    }
  })

  it('köar ingenting när servern inte screenar', async () => {
    const { renders, asked } = watched()
    const { upload } = await loggedIn({ renders })
    expect((await upload(PNG, 'image/png')).status).toBe(201)
    expect(asked).toEqual([])
  })
})

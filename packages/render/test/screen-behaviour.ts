import { describe, expect, it } from 'vitest'
import { FAKE_CLASSIFIER } from '@byd/screening'
import type { RenderRequest, RenderStore } from '../src/store.js'
import { screenRequest } from '../src/screen.js'

// Screening (F4, #1271) is a job kind of the render queue, after textures and prints (DRIFT §6):
// nobody waits for it, and a table being laid must never wait behind it. A result is kept once per
// picture, classifier and version, so a second job for the same is a no-op.

const ASSET = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const texture = (id: string, at: number): RenderRequest => ({ hash: `t-${id}`, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: `<div>${id}</div>`, css: '' }, requestedAt: at })
const print = (id: string, at: number): RenderRequest => ({ hash: `p-${id}`, kind: { kind: 'pdf' }, priority: 'print', compiled: { html: `<div>${id}</div>`, css: '' }, requestedAt: at })
const result = (asset: string, at: number) => ({ asset, classifier: FAKE_CLASSIFIER, scores: { sexual: 0.1, violence: 0.8 }, imageHash: { algorithm: 'dhash-64', bits: '00ff00ff00ff00ff' }, screenedAt: at })

export function screenQueueBehaviour(name: string, store: () => Promise<RenderStore>): void {
  describe(`jobbslaget screen i renderkön: ${name}`, () => {
    it('lämnar ut texturer och tryck före screening, hur gammal screeningen än är', async () => {
      const q = await store()
      const screen = screenRequest(ASSET, FAKE_CLASSIFIER, 1)
      expect(screen.priority).toBe('screen')
      await q.enqueue(screen)
      await q.enqueue(print('1', 2))
      await q.enqueue(texture('1', 3))
      expect((await q.claim(10))?.hash).toBe('t-1')
      expect((await q.claim(10))?.hash).toBe('p-1')
      const claimed = await q.claim(10)
      expect(claimed).toMatchObject({ hash: screen.hash, kind: { kind: 'screen', asset: ASSET, classifier: FAKE_CLASSIFIER, maxPx: 512 } })
      expect(await q.claim(10)).toBeNull()
    })

    it('håller ett resultat per bild, klassificerare och version, och köar inte samma igen', async () => {
      const q = await store()
      const job = screenRequest(ASSET, FAKE_CLASSIFIER, 1)
      expect(await q.enqueue(job)).toBe('queued')
      expect(await q.enqueue(screenRequest(ASSET, FAKE_CLASSIFIER, 2))).toBe('queued-already')
      expect(await q.screeningOf(ASSET, FAKE_CLASSIFIER)).toBeNull()

      await q.completeScreening((await q.claim(5))!.hash, result(ASSET, 5))
      expect(await q.status(job.hash)).toMatchObject({ state: 'done' })
      expect(await q.screeningOf(ASSET, FAKE_CLASSIFIER)).toEqual(result(ASSET, 5))
      expect(await q.enqueue(screenRequest(ASSET, FAKE_CLASSIFIER, 6))).toBe('cached')
      expect(await q.claim(7)).toBeNull()
      // A screening is no picture: there is nothing to serve under its job.
      expect(await q.output(job.hash)).toBeNull()

      // Another version of the classifier is another result, and the picture is screened again.
      const next = { ...FAKE_CLASSIFIER, version: '2' }
      expect(await q.screeningOf(ASSET, next)).toBeNull()
      expect(await q.enqueue(screenRequest(ASSET, next, 8))).toBe('queued')
      // And another picture under the same version is its own.
      expect(await q.enqueue(screenRequest(OTHER, FAKE_CLASSIFIER, 9))).toBe('queued')
    })

    it('lägger fram resultaten och de misslyckade jobben för en klassificerare och version', async () => {
      const q = await store()
      const next = { ...FAKE_CLASSIFIER, version: '2' }
      for (const [asset, ref, at] of [[ASSET, FAKE_CLASSIFIER, 1], [OTHER, FAKE_CLASSIFIER, 2], [ASSET, next, 3]] as const) await q.enqueue(screenRequest(asset, ref, at))
      await q.completeScreening((await q.claim(10))!.hash, result(ASSET, 10))
      await q.fail((await q.claim(11))!.hash, `asset ${OTHER} could not be decoded`)

      expect(await q.screenings(FAKE_CLASSIFIER)).toEqual([result(ASSET, 10)])
      expect(await q.screeningFailures(FAKE_CLASSIFIER)).toEqual([{ asset: OTHER, error: `asset ${OTHER} could not be decoded` }])
      expect(await q.screenings(next)).toEqual([])
      expect(await q.screeningFailures(next)).toEqual([])
      // A failed screening is queued again by asking for it again, as any failed job is.
      expect(await q.enqueue(screenRequest(OTHER, FAKE_CLASSIFIER, 12))).toBe('queued')
      expect(await q.screeningFailures(FAKE_CLASSIFIER)).toEqual([])
    })
  })
}

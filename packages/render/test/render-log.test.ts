import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MemoryRenderStore, type RenderRequest, type RenderStore } from '../src/store.js'
import { PostgresRenderStore } from '../src/store-postgres.js'

// The render log (#1197, #1192): a rendering is content-addressed, so the queue keeps no owner, and
// who caused one can only be written down in the moment. One line per job the queue answered
// `queued` for — never `cached`, never `queued-already` — on the account the caller names as the
// bearer, written in the same step as the job.
//
// Against memory and against Postgres; the Postgres half runs only with DATABASE_URL=postgres://...
const url = process.env['DATABASE_URL']
const schema = `test_render_log_${process.pid}_${Date.now()}`

const backends: { name: string; skip: boolean; open(): Promise<{ store: RenderStore; close(): Promise<void> }> }[] = [
  { name: 'memory', skip: false, open: async () => ({ store: new MemoryRenderStore(), close: () => Promise.resolve() }) },
  {
    name: 'Postgres',
    skip: !url,
    open: async () => {
      const store = PostgresRenderStore.connect(url!, undefined, { schema })
      await store.migrate()
      return {
        store,
        close: async () => {
          await store.dropSchema()
          await store.close()
        },
      }
    },
  },
]

let n = 0
const page = (at: number, id = `p${++n}`): RenderRequest => ({ hash: `${schema}-${id}`, kind: { kind: 'png', dpi: 150 }, priority: 'texture', compiled: { html: `<div>${id}</div>`, css: '' }, requestedAt: at })

for (const backend of backends) {
  describe.skipIf(backend.skip)(`the render log, in ${backend.name} (#1197)`, () => {
    let store: RenderStore
    let close: () => Promise<void>
    beforeAll(async () => {
      ;({ store, close } = await backend.open())
    })
    afterAll(async () => {
      await close()
    })

    it('writes one line on the bearer for each job that was queued, and none for one queued already or rendered', async () => {
      const ada = `ada-${++n}`
      const a = page(1_000)
      expect(await store.enqueue(a, ada)).toBe('queued')
      expect(await store.enqueue({ ...a, requestedAt: 1_001 }, ada)).toBe('queued-already')
      const job = await store.claim(1_002)
      await store.complete(job!.hash, new Uint8Array([1]))
      expect(await store.enqueue({ ...a, requestedAt: 1_003 }, ada)).toBe('cached')
      expect(await store.enqueue(page(1_004), ada)).toBe('queued')
      expect(await store.rendersBy(ada, 0)).toBe(2)
    })

    it('counts a job only on the account that bore it, and a job nobody bore on nobody', async () => {
      const ada = `ada-${++n}`
      const bo = `bo-${n}`
      await store.enqueue(page(2_000), ada)
      await store.enqueue(page(2_001), bo)
      await store.enqueue(page(2_002), bo)
      await store.enqueue(page(2_003))
      expect(await store.rendersBy(ada, 0)).toBe(1)
      expect(await store.rendersBy(bo, 0)).toBe(2)
    })

    it('counts from a moment on, so a rolling window is a question of where it starts', async () => {
      const ada = `ada-${++n}`
      await store.enqueue(page(10_000), ada)
      await store.enqueue(page(20_000), ada)
      await store.enqueue(page(30_000), ada)
      expect(await store.rendersBy(ada, 20_000)).toBe(2)
      expect(await store.rendersBy(ada, 30_001)).toBe(0)
    })

    it('a failed job asked for again is queued again, and costs again', async () => {
      const ada = `ada-${++n}`
      const a = page(40_000)
      await store.enqueue(a, ada)
      await store.fail(a.hash, 'chromium died')
      expect(await store.enqueue({ ...a, requestedAt: 40_002 }, ada)).toBe('queued')
      expect(await store.rendersBy(ada, 0)).toBe(2)
    })
  })
}

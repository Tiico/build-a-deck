import { expect, it } from 'vitest'
import type { Priority, RenderRequest, RenderStore } from '../src/store.js'

// The queue takes turns between tables (#1546, beställarens beslut 2026-11-01): one worker draws
// every table's textures, and a table that queued 576 of them must not hold the next table back for
// minutes. Each table numbers its textures from 0, the ones that are seen first first, and the queue
// hands out the lowest place first: every table's first before any table's second. The kinds keep
// their order (DRIFT §6): a print or a screening still waits for every texture.
//
// Shared by the memory store and Postgres, so both hand out the same order.
export function fairQueueBehaviour(store: () => RenderStore, tag: string): void {
  const req = (id: string, o: { order?: number; at: number; priority?: Priority }): RenderRequest => ({
    hash: `${tag}-${id}`,
    kind: o.priority === 'print' ? { kind: 'pdf' } : { kind: 'png', dpi: 150 },
    priority: o.priority ?? 'texture',
    compiled: { html: `<div>${id}</div>`, css: '' },
    requestedAt: o.at,
    ...(o.order !== undefined ? { order: o.order } : {}),
  })
  const drain = async (q: RenderStore, n: number) => {
    const out: string[] = []
    for (let i = 0; i < n; i++) out.push((await q.claim(1000 + i))?.hash.slice(tag.length + 1) ?? 'none')
    return out
  }

  it('takes turns between tables, so every table gets its first texture before any gets its second (#1546)', async () => {
    const q = store()
    let at = 1
    for (const table of ['a', 'b', 'c']) for (let i = 0; i < 3; i++) await q.enqueue(req(`fair-${table}${i}`, { order: i, at: at++ }))
    expect(await drain(q, 9)).toEqual(['fair-a0', 'fair-b0', 'fair-c0', 'fair-a1', 'fair-b1', 'fair-c1', 'fair-a2', 'fair-b2', 'fair-c2'])
  })

  it('draws a table\'s textures in the table\'s own order, whatever order they were queued in (#1546)', async () => {
    const q = store()
    await q.enqueue(req('own-late', { order: 5, at: 1 }))
    await q.enqueue(req('own-seen', { order: 0, at: 2 }))
    await q.enqueue(req('own-next', { order: 3, at: 3 }))
    expect(await drain(q, 3)).toEqual(['own-seen', 'own-next', 'own-late'])
  })

  it('lets a table that starts while another is half drawn catch up with it, and then they take turns (#1546)', async () => {
    const q = store()
    for (let i = 0; i < 4; i++) await q.enqueue(req(`late-a${i}`, { order: i, at: 1 + i }))
    expect(await drain(q, 2)).toEqual(['late-a0', 'late-a1'])
    for (let i = 0; i < 4; i++) await q.enqueue(req(`late-b${i}`, { order: i, at: 10 + i }))
    expect(await drain(q, 6)).toEqual(['late-b0', 'late-b1', 'late-a2', 'late-b2', 'late-a3', 'late-b3'])
  })

  it('still draws every texture before a print, whichever table asked for it (DRIFT §6)', async () => {
    const q = store()
    await q.enqueue(req('kind-print', { order: 0, at: 1, priority: 'print' }))
    await q.enqueue(req('kind-t1', { order: 0, at: 2 }))
    await q.enqueue(req('kind-t2', { order: 1, at: 3 }))
    expect(await drain(q, 3)).toEqual(['kind-t1', 'kind-t2', 'kind-print'])
  })
}

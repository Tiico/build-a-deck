import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TableClient } from '../src/client.js'
import { createSession, startServer, type Running } from './fixture.js'

let run: Running
let clients: TableClient[] = []

beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  for (const c of clients) c.close()
  clients = []
  await run.stop()
})

async function connect(sessionId: string, seat: string | null): Promise<TableClient> {
  const c = TableClient.connect({ url: run.url, sessionId, seat, reconnectDelayMs: 50 })
  clients.push(c)
  await c.ready()
  return c
}

describe('TableClient', () => {
  it('connects and exposes the snapshot for its seat', async () => {
    const id = await createSession(run.store)
    const a = await connect(id, 'A')
    expect(a.status).toBe('open')
    expect(a.view).toMatchObject({ seq: 0, seat: 'A' })
    expect(a.view?.zones.map((z) => z.id)).toEqual(['discard', 'draw', 'hand:A', 'hand:B', 'table'])
  })
})

describe('sending intents', () => {
  it('resolves with the seqs the envelope produced and the view follows via patches', async () => {
    const id = await createSession(run.store)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')

    const result = await a.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    expect(result).toEqual({ ok: true, seqs: [1] })
    expect(a.view?.seq).toBe(1)
    expect(a.view?.components.filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)).toEqual(['dragon', 'knight'])

    await b.synced(1)
    expect(b.view?.zones.find((z) => z.id === 'hand:A')).toMatchObject({ mode: 'count', count: 2 })
    expect(b.view?.components).toHaveLength(0)
  })
})

describe('rejections', () => {
  it('surfaces a refused envelope as a result, and the view does not move', async () => {
    const id = await createSession(run.store)
    const a = await connect(id, 'A')
    const result = await a.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 99 })
    expect(result).toMatchObject({ ok: false, reason: /fewer than 99/ })
    expect(a.view?.seq).toBe(0)
  })
})

describe('reconnection', () => {
  it('reconnects after the server restarts and resyncs to the current seq', async () => {
    const id = await createSession(run.store)
    const a = await connect(id, 'A')
    const statuses: string[] = []
    a.subscribe((_view, status) => statuses.push(status))

    await run.restart()
    // Something happens while A is away.
    const b = await connect(id, 'B')
    await b.send({ v: 'draw', from: 'draw', to: 'hand:B', count: 1 })

    await a.synced(1)
    expect(a.status).toBe('open')
    expect(a.view?.zones.find((z) => z.id === 'hand:B')).toMatchObject({ mode: 'count', count: 1 })
    expect(statuses).toContain('reconnecting')
    expect(statuses.at(-1)).toBe('open')
  })
})

describe('activity', () => {
  it('keeps the recent redacted log lines and notifies subscribers when they arrive', async () => {
    const id = await createSession(run.store)
    const table = await connect(id, null)
    const b = await connect(id, 'B')
    const seen: number[] = []
    b.subscribe(() => seen.push(b.activity.length))

    await table.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })
    await table.send({ v: 'shuffle', pile: 'draw' })
    await b.synced(2)
    // Activity is its own message, not the patch: wait for the lines themselves to land.
    await waitUntil(() => b.activity.length === 2)

    expect(b.activity.map((l) => [l.seq, l.by, l.intent.v])).toEqual([
      [1, null, 'seat.claim'],
      [2, null, 'shuffle'],
    ])
    expect(b.activity.every((l) => !('outcome' in l))).toBe(true)
    expect(seen).toContain(2)
  })
})

describe('presence (K6)', () => {
  it('reaches the others at the table and never the log; cursor updates are throttled, the last one always arrives', async () => {
    const id = await createSession(run.store)
    const a = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    const b = TableClient.connect({ url: run.url, sessionId: id, seat: 'B' })
    await Promise.all([a.ready(), b.ready()])
    const seen: { from: { seat: string | null }; presence: { kind: string; x?: number } }[] = []
    b.onPresence((from, presence) => seen.push({ from, presence }))

    a.sendPresence({ kind: 'point', x: 1, y: 2 })
    await waitUntil(() => seen.length === 1)
    expect(seen[0]).toMatchObject({ from: { seat: 'A' }, presence: { kind: 'point', x: 1 } })

    for (let i = 0; i < 20; i++) a.sendPresence({ kind: 'cursor', x: i, y: 0 })
    // The last cursor is the one the throttle promises will arrive; waiting for it is what makes
    // the count below a measurement of the throttle rather than of how fast the machine is. An
    // unthrottled client would have sent all twenty in the same loop, so they would be here too.
    await waitUntil(() => seen.some((s) => s.presence.kind === 'cursor' && s.presence.x === 19))
    const cursors = seen.filter((s) => s.presence.kind === 'cursor')
    expect(cursors.length).toBeGreaterThanOrEqual(1)
    expect(cursors.length).toBeLessThanOrEqual(3)
    expect(cursors.at(-1)?.presence.x).toBe(19)
    expect(await run.store.read(id)).toEqual([])
    a.close()
    b.close()
  })
})

async function waitUntil(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now()
  while (!pred()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 10))
  }
}

describe('the observer (C8) and the roster', () => {
  it('connects as a named observer who sees every hand, and every client learns who is watching', async () => {
    const id = await createSession(run.store)
    const a = TableClient.connect({ url: run.url, sessionId: id, seat: 'A' })
    await a.ready()
    await a.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })
    const table = TableClient.connect({ url: run.url, sessionId: id, seat: null })
    await table.ready()
    expect(table.observers).toEqual([])

    const eva = TableClient.connect({ url: run.url, sessionId: id, seat: null, observer: 'Eva' })
    await eva.ready()
    expect(eva.view!.components.filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)).toEqual([expect.any(String), expect.any(String)])
    await waitUntil(() => table.observers.length === 1)
    expect(table.observers).toEqual([{ id: expect.any(String), name: 'Eva' }])
    expect((await eva.send({ v: 'flag', note: 'hm' })).ok).toBe(true)
    expect((await run.store.read(id)).at(-1)?.intent).toEqual({ v: 'flag', note: 'hm', observer: 'Eva' })
    eva.close()
    await waitUntil(() => table.observers.length === 0)
    a.close()
    table.close()
  })
})

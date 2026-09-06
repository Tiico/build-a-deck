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

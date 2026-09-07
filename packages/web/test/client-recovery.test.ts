// @vitest-environment jsdom
import { createServer, type Server, type Socket } from 'node:net'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TableClient } from '../src/client.js'
import { createSession, startServer, type Running } from './fixture.js'

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

// A socket that accepts the connection and then says nothing at all: what a service behind a
// load balancer that has stopped answering looks like from a phone. Before #7 this left
// `Ansluter…` standing for ever, because nothing anywhere had a deadline.
async function deafServer(): Promise<{ url: string; stop(): Promise<void> }> {
  const open: Socket[] = []
  const server: Server = createServer((s) => open.push(s))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `ws://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>((resolve) => {
        for (const s of open) s.destroy()
        server.close(() => resolve())
      }),
  }
}

const settles = async (predicate: () => boolean, ms = 4000) => {
  const until = Date.now() + ms
  while (!predicate() && Date.now() < until) await new Promise((r) => setTimeout(r, 10))
  return predicate()
}

// A restart is over on the server before the client has heard the socket close, so "open" on
// its own proves nothing: the round trip is only done once the drop has been seen and undone.
const watch = (c: TableClient) => {
  const seen: string[] = []
  c.subscribe((_view, status) => seen.push(status))
  return () => seen.includes('reconnecting') && c.status === 'open'
}

describe('an initial connection that never answers', () => {
  it('gives up after its deadline instead of connecting for ever', async () => {
    const deaf = await deafServer()
    const c = TableClient.connect({ url: deaf.url, sessionId: 's1', seat: null, connectTimeoutMs: 150, retryPlanMs: [20] })
    expect(await settles(() => c.trouble !== null)).toBe(true)
    expect(c.trouble).toBe('timeout')
    c.close()
    await deaf.stop()
  })

  it('tells whoever is listening the moment it gives up, so a view can stop waiting', async () => {
    const deaf = await deafServer()
    const c = TableClient.connect({ url: deaf.url, sessionId: 's1', seat: null, connectTimeoutMs: 150, retryPlanMs: [20] })
    const seen: (string | null)[] = []
    c.subscribe(() => seen.push(c.trouble))
    expect(await settles(() => seen.includes('timeout'))).toBe(true)
    c.close()
    await deaf.stop()
  })
})

describe('a session the server does not know', () => {
  it('says so once and never tries again, because asking again gives the same answer', async () => {
    const c = TableClient.connect({ url: run.url, sessionId: 'nothing-here', seat: null, retryPlanMs: [20, 20] })
    expect(await settles(() => c.trouble !== null)).toBe(true)
    expect(c.trouble).toBe('missing')
    // The retry plan is short enough that an automatic reconnect would have happened by now.
    await new Promise((r) => setTimeout(r, 120))
    expect(c.trouble).toBe('missing')
    c.close()
  })
})

describe('reconnecting on its own', () => {
  it('comes back by itself while the plan lasts', async () => {
    const id = await createSession(run.store)
    const c = TableClient.connect({ url: run.url, sessionId: id, seat: null, retryPlanMs: [20, 40, 80] })
    await c.ready()
    const back = watch(c)
    await run.restart()
    expect(await settles(back)).toBe(true)
    expect(c.trouble).toBeNull()
    c.close()
  })

  it('stops when the plan is spent and hands the decision to a person', async () => {
    const id = await createSession(run.store)
    const c = TableClient.connect({ url: run.url, sessionId: id, seat: null, retryPlanMs: [20, 20] })
    await c.ready()
    await run.stop()
    expect(await settles(() => c.trouble === 'exhausted')).toBe(true)
    expect(c.status).toBe('reconnecting')
    c.close()
  })

  it('starts over when a person asks, and keeps the view it already had', async () => {
    const id = await createSession(run.store)
    const c = TableClient.connect({ url: run.url, sessionId: id, seat: null, retryPlanMs: [20, 20] })
    await c.ready()
    const before = c.view!.seq
    await run.stop()
    expect(await settles(() => c.trouble === 'exhausted')).toBe(true)
    await run.restart()
    c.retry()
    expect(c.trouble).toBeNull()
    expect(await settles(() => c.status === 'open')).toBe(true)
    expect(c.view!.seq).toBeGreaterThanOrEqual(before)
    c.close()
  })

  it('counts down to the next attempt so the wait is visible rather than a page that blinks', async () => {
    const id = await createSession(run.store)
    const c = TableClient.connect({ url: run.url, sessionId: id, seat: null, retryPlanMs: [400, 400] })
    await c.ready()
    await run.stop()
    expect(await settles(() => c.status === 'reconnecting')).toBe(true)
    expect(c.nextRetryAt).not.toBeNull()
    expect(c.nextRetryAt! - Date.now()).toBeGreaterThan(0)
    expect(c.attempts).toEqual({ made: 1, of: 2 })
    c.close()
  })
})

// The whole point of a log the server owns: a client that comes back says nothing twice.
describe('what a reconnect writes to the log', () => {
  it('resyncs to the snapshot without any envelope landing in the log twice', async () => {
    const id = await createSession(run.store)
    const c = TableClient.connect({ url: run.url, sessionId: id, seat: 'A', retryPlanMs: [20, 40, 80] })
    await c.ready()
    expect(await c.send({ v: 'seat.claim', seat: 'A', name: 'Ada' })).toEqual({ ok: true, seqs: expect.any(Array) })

    const back = watch(c)
    await run.restart()
    expect(await settles(back)).toBe(true)
    expect(await c.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 2 })).toEqual({ ok: true, seqs: expect.any(Array) })

    const lines = await run.store.read(id)
    const batches = lines.map((l) => l.batch)
    expect(new Set(batches).size).toBe(batches.length)
    // The snapshot after the reconnect holds the seat's own hand, so the resync really did
    // restore the state and not merely the connection.
    expect(c.view!.components.filter((comp) => comp.zone === 'hand:A').length).toBe(2)
    c.close()
  })

  it('lets go of an envelope that was in flight when the line died rather than sending it again', async () => {
    const id = await createSession(run.store)
    const c = TableClient.connect({ url: run.url, sessionId: id, seat: 'A', retryPlanMs: [20, 40, 80] })
    await c.ready()
    const back = watch(c)
    const inFlight = c.send({ v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await run.restart()
    const result = await inFlight
    expect(await settles(back)).toBe(true)
    // Either the server committed it before the line died or it never arrived; what must never
    // happen is the client deciding to say it a second time.
    const lines = await run.store.read(id)
    expect(lines.filter((l) => l.intent.v === 'draw').length).toBeLessThanOrEqual(1)
    if (!result.ok) expect(result.reason).toBe('connection lost')
    c.close()
  })
})

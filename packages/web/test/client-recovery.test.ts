// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TableClient } from '../src/client.js'
import { asSeat, asTable, createSession, deafServer, goingDeafProxy, startServer, type Running } from './fixture.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

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
    // The sentence above is about a line that hangs, and a fixture that hung up instead would put
    // a different test under the same name: the client would then be giving up because the socket
    // closed and not because its deadline came. This is the fixture saying which of the two it was
    // (#265), and it is the reading the copy that used to live in this file could not make.
    expect(deaf.stayedDeaf()).toBe(true)
    c.close()
    await deaf.stop()
  })

  it('tells whoever is listening the moment it gives up, so a view can stop waiting', async () => {
    const deaf = await deafServer()
    const c = TableClient.connect({ url: deaf.url, sessionId: 's1', seat: null, connectTimeoutMs: 150, retryPlanMs: [20] })
    const seen: (string | null)[] = []
    c.subscribe(() => seen.push(c.trouble))
    expect(await settles(() => seen.includes('timeout'))).toBe(true)
    expect(deaf.stayedDeaf()).toBe(true)
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
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [20, 40, 80] })
    await c.ready()
    const back = watch(c)
    await run.restart()
    expect(await settles(back)).toBe(true)
    expect(c.trouble).toBeNull()
    c.close()
  })

  it('stops when the plan is spent and hands the decision to a person', async () => {
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [20, 20] })
    await c.ready()
    await run.stop()
    expect(await settles(() => c.trouble === 'exhausted')).toBe(true)
    expect(c.status).toBe('reconnecting')
    c.close()
  })

  it('starts over when a person asks, and keeps the view it already had', async () => {
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [20, 20] })
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

  // An attempt that is neither refused nor answered (#483, fynd 3). The first connection had a
  // deadline and the reconnects had none, so one silent attempt stood at «försök 1 av 4» for ever
  // and «Försök nu» hung the same way. Each attempt now has the same deadline, and the plan goes on.
  it('gives each reconnect the deadline the first connection has, and spends the plan', async () => {
    const id = await createSession(run)
    const line = await goingDeafProxy(run.url)
    const c = TableClient.connect({ ...(await asTable(run, id)), url: line.url, connectTimeoutMs: 150, retryPlanMs: [20, 20] })
    await c.ready()
    line.deafen()
    expect(await settles(() => c.trouble === 'exhausted', 3000)).toBe(true)
    // Not vacuous: the attempts really reached a line that said nothing.
    expect(line.held()).toBeGreaterThanOrEqual(2)
    // And a person's «Försök nu» is held to the same deadline.
    c.retry()
    expect(c.trouble).toBeNull()
    expect(await settles(() => c.trouble === 'exhausted', 3000)).toBe(true)
    c.close()
    await line.stop()
  })

  it('counts down to the next attempt so the wait is visible rather than a page that blinks', async () => {
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [400, 400] })
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
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asSeat(run, id, 'A')), retryPlanMs: [20, 40, 80] })
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
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asSeat(run, id, 'A')), retryPlanMs: [20, 40, 80] })
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

// A screen nobody touches (#722, D5 reviderat 2026-10-05): the TV and the felt's own screen gave up
// after the plan like every other, and a quarter-minute of bad wifi froze the shared table until
// somebody got up to press «Försök nu». Such a screen goes on trying after the plan — every
// `keepTrying` and at once when the browser says the network is back — and never stops by itself.
describe('a screen nobody touches, after the plan', () => {
  it('goes on trying on its own and comes back when the line does', async () => {
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [20, 20], keepTryingMs: 150 })
    await c.ready()
    await run.stop()
    // Past the plan, and still not given up.
    await new Promise((r) => setTimeout(r, 400))
    expect(c.trouble).toBeNull()
    expect(c.status).toBe('reconnecting')
    await run.restart()
    expect(await settles(() => c.status === 'open', 3000)).toBe(true)
    c.close()
  })

  it('tries at once when the browser says the network is back', async () => {
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [20, 20], keepTryingMs: 60_000 })
    await c.ready()
    await run.stop()
    await new Promise((r) => setTimeout(r, 300))
    await run.restart()
    // The next try is a minute away; the `online` event is what brings it back.
    window.dispatchEvent(new Event('online'))
    expect(await settles(() => c.status === 'open', 3000)).toBe(true)
    c.close()
  })

  it('says how long until the next try, without counting past the plan', async () => {
    const id = await createSession(run)
    const c = TableClient.connect({ ...(await asTable(run, id)), retryPlanMs: [20, 20], keepTryingMs: 5_000 })
    await c.ready()
    await run.stop()
    expect(await settles(() => c.attempts.made === 2 && c.nextRetryAt !== null && c.nextRetryAt - Date.now() > 1_000, 3000)).toBe(true)
    // Beyond the plan the count has no «of»: «försök 3 av 2» would be a promise the screen does not keep.
    expect(c.attempts.of).toBeNull()
    c.close()
  })
})

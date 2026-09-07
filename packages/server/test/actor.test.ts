import { SCHEMA_VERSION } from '@byd/protocol'
import { describe, expect, it } from 'vitest'
import type { Applied, ServerMessage } from '@byd/protocol'
import { counterIds, seededRng } from '@byd/engine'
import { MemoryLogStore, TableActor, TableHost, type LogStore } from '../src/index.js'
import { registry, twoSeatSetup } from './fixture.js'

const deps = () => ({ rng: seededRng(1), ids: counterIds('r'), now: () => '2026-09-06T00:00:00.000Z' })

async function actorWith(store: LogStore = new MemoryLogStore()) {
  await store.createSession({ id: 's', version: 'v1', setup: twoSeatSetup() })
  const actor = (await TableActor.load('s', registry, store, deps()))!
  return { store, actor }
}

describe('TableActor', () => {
  it('serialises concurrent envelopes: consecutive seqs, no interleaving', async () => {
    const { actor, store } = await actorWith()
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        actor.submit({ id: `e${i}`, seat: null, intents: [{ v: 'draw', from: 'draw', to: 'table', count: 1 }] }),
      ),
    )
    expect(results.every((r) => r.ok)).toBe(true)
    const log = await store.read('s')
    expect(log.map((l) => l.seq)).toEqual([1, 2, 3, 4, 5])
    expect(actor.seq).toBe(5)
  })

  it('does not apply what the store failed to commit', async () => {
    const store = new MemoryLogStore()
    const failing: LogStore = {
      ...bind(store),
      append: async () => {
        throw new Error('disk on fire')
      },
    }
    const { actor } = await actorWith(failing)
    const messages: ServerMessage[] = []
    actor.subscribe({ seat: null, id: 't', send: (m) => messages.push(m) })

    await expect(
      actor.submit({ id: 'e', seat: null, intents: [{ v: 'draw', from: 'draw', to: 'table', count: 1 }] }),
    ).rejects.toThrow(/disk on fire/)
    expect(actor.seq).toBe(0)
    expect(messages.filter((m) => m.t === 'patch')).toHaveLength(0)
    // The queue survives the failure.
    const next = await actor.submit({ id: 'e2', seat: null, intents: [{ v: 'session.end' }] }).catch(() => 'still failing')
    expect(next).toBe('still failing')
  })

  it('is rebuilt from its log on load and continues from there', async () => {
    const { actor, store } = await actorWith()
    await actor.submit({ id: 'e1', seat: null, intents: [{ v: 'shuffle', pile: 'draw' }] })
    await actor.submit({ id: 'e2', seat: null, intents: [{ v: 'deal', from: 'draw', to: ['hand:A', 'hand:B'], each: 2 }] })

    const reloaded = (await TableActor.load('s', registry, store, deps()))!
    expect(reloaded.seq).toBe(2)
    const r = await reloaded.submit({ id: 'e3', seat: 'A', intents: [{ v: 'draw', from: 'draw', to: 'hand:A', count: 1 }] })
    expect(r.ok && r.applied[0]?.seq).toBe(3)
    expect((await store.read('s')).map((l: Applied) => l.seq)).toEqual([1, 2, 3])
  })

  it('sends each subscriber only its own patches', async () => {
    const { actor } = await actorWith()
    const seen = new Map<string | null, ServerMessage[]>()
    for (const seat of ['A', 'B', null] as const) {
      const list: ServerMessage[] = []
      seen.set(seat, list)
      actor.subscribe({ seat, id: `s-${seat ?? "t"}`, send: (m) => list.push(m) })
    }
    await actor.submit({ id: 'e', seat: 'A', intents: [{ v: 'draw', from: 'draw', to: 'hand:A', count: 2 }] })
    const upserts = (seat: string | null) =>
      seen.get(seat)!.flatMap((m) => (m.t === 'patch' ? m.patch.ops.filter((op) => op.op === 'upsert') : []))
    expect(upserts('A')).toHaveLength(2)
    expect(upserts('B')).toHaveLength(0)
    expect(upserts(null)).toHaveLength(0)
  })
})

describe('TableHost', () => {
  it('loads a table once, shares it, and evicts it when idle', async () => {
    const store = new MemoryLogStore()
    await store.createSession({ id: 's', version: 'v1', setup: twoSeatSetup() })
    const host = new TableHost(registry, store, deps)
    const [x, y] = await Promise.all([host.get('s'), host.get('s')])
    expect(x).toBe(y)
    expect(await host.get('missing')).toBeNull()
    expect(await host.loaded()).toHaveLength(1)

    expect(await host.evictIdle(60_000)).toEqual([])
    expect(await host.evictIdle(-1)).toEqual(['s'])
    expect(await host.loaded()).toHaveLength(0)
  })
})

function bind(store: MemoryLogStore): LogStore {
  return {
    createSession: (r) => store.createSession(r),
    loadSession: (id) => store.loadSession(id),
    append: (id, lines) => store.append(id, lines),
    read: (id) => store.read(id),
    staleSessions: (d) => store.staleSessions(d),
    sessionsOf: (project) => store.sessionsOf(project),
    sessionByCode: (code) => store.sessionByCode(code),
    setCode: (id, code, at) => store.setCode(id, code, at),
    issueGuest: (id, g) => store.issueGuest(id, g),
    guestByToken: (id, h) => store.guestByToken(id, h),
    revokeGuests: (id, seat, at) => store.revokeGuests(id, seat, at),
  }
}

describe('abandoned tables (C9)', () => {
  it('the store names sessions with no line for a while that have not ended; the host ends them for the group', async () => {
    const store = new MemoryLogStore()
    const t0 = Date.parse('2026-09-06T10:00:00.000Z')
    await store.createSession({ id: 'old', version: 'v1', setup: twoSeatSetup() })
    await store.createSession({ id: 'fresh', version: 'v1', setup: twoSeatSetup() })
    await store.createSession({ id: 'done', version: 'v1', setup: twoSeatSetup() })
    const at = (ms: number) => new Date(t0 + ms).toISOString()
    await store.append('old', [{ schemaVersion: SCHEMA_VERSION, seq: 1, batch: 'b1', at: at(0), by: null, intent: { v: 'setup.reset' } }])
    await store.append('fresh', [{ schemaVersion: SCHEMA_VERSION, seq: 1, batch: 'b2', at: at(3 * 3600_000), by: null, intent: { v: 'setup.reset' } }])
    await store.append('done', [{ schemaVersion: SCHEMA_VERSION, seq: 1, batch: 'b3', at: at(0), by: null, intent: { v: 'session.end' } }])

    const stale = await store.staleSessions(new Date(t0 + 2 * 3600_000))
    expect(stale.sort()).toEqual(['old'])

    const host = new TableHost(registry, store, deps)
    const ended = await host.endStale(new Date(t0 + 2 * 3600_000))
    expect(ended).toEqual(['old'])
    const log = await store.read('old')
    expect(log.at(-1)).toMatchObject({ by: null, intent: { v: 'session.end' } })
    expect(await store.staleSessions(new Date(t0 + 2 * 3600_000))).toEqual([])
  })
})

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WireClient } from './client.js'
import { createSession, start, type Running } from './fixture.js'

let run: Running
let clients: WireClient[] = []

beforeEach(async () => {
  run = await start()
})
afterEach(async () => {
  await Promise.all(clients.map((c) => c.close()))
  clients = []
  await run.stop()
})

async function connect(sessionId: string, seat: string | null): Promise<WireClient> {
  const c = await WireClient.connect(run.base, sessionId, seat)
  clients.push(c)
  return c
}

// Everything that ever crossed the wire to this client, decoded, as components.
function componentsOnWire(c: WireClient) {
  return c.messages.flatMap((m) => {
    if (m.t === 'snapshot') return m.snapshot.components
    if (m.t === 'patch') return m.patch.ops.flatMap((op) => (op.op === 'upsert' ? [op.state] : []))
    return []
  })
}

describe('hidden information on the wire', () => {
  it("A's hand never crosses the wire to B or to the table — verified on raw frames", async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    const table = await connect(id, null)

    const ack = await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    expect(ack).toMatchObject({ t: 'ack', seqs: [1] })
    await b.synced(1)
    await table.synced(1)

    for (const other of [b, table]) {
      expect(componentsOnWire(other).filter((c) => c.zone === 'hand:A')).toHaveLength(0)
      expect(componentsOnWire(other).filter((c) => c.cardRef !== null)).toHaveLength(0)
      expect(other.frames.join('\n')).not.toMatch(/dragon|knight|wizard/)
      expect(other.view?.zones.find((z) => z.id === 'hand:A')).toMatchObject({ mode: 'count', count: 3 })
    }
    await a.synced(1)
    expect(a.view?.components.filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)).toEqual([
      'dragon',
      'knight',
      'wizard',
    ])
  })

  it('a card played face-up becomes readable for everyone, a face-down one for no one', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await a.synced(1)
    const card = a.view!.components.find((c) => c.zone === 'hand:A')!.id

    await a.send('A', { v: 'move', component: card, to: 'table', x: 10, y: 10 })
    await b.synced(2)
    expect(b.view!.components.find((c) => c.id === card)).toMatchObject({ zone: 'table', cardRef: null })
    expect(b.frames.join('\n')).not.toMatch(/dragon/)

    await a.send('A', { v: 'flip', component: card, face: 'front' })
    await b.synced(3)
    expect(b.view!.components.find((c) => c.id === card)).toMatchObject({ cardRef: 'dragon' })
  })

  it('a shuffle sends B only a count, and the old ids never reappear', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await a.synced(1)
    const known = a.view!.components[0]!.id
    await a.send('A', { v: 'move', component: known, to: 'draw' })
    await a.send(null, { v: 'shuffle', pile: 'draw' }).catch(() => undefined)
    // The table connection shuffles, since A's connection can only speak as A.
    const table = await connect(id, null)
    await table.send(null, { v: 'shuffle', pile: 'draw' })
    await b.synced(3)
    expect(b.view!.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'count', count: 10 })
    expect(b.frames.slice(1).join('\n')).not.toContain(known)
  })
})

describe('envelopes', () => {
  it('acks with the seq numbers a batch produced, in order', async () => {
    const id = await createSession(run.http)
    const table = await connect(id, null)
    const ack = await table.send(
      null,
      { v: 'draw', from: 'draw', to: 'table', count: 2 },
      { v: 'shuffle', pile: 'draw' },
    )
    expect(ack).toMatchObject({ t: 'ack', seqs: [1, 2] })
    await table.synced(2)
    expect(table.view!.seq).toBe(2)
  })

  it('rejects an envelope that speaks for another seat', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const res = await a.send('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    expect(res).toMatchObject({ t: 'reject', reason: /does not match connection seat/ })
  })

  it('rejects a structurally invalid envelope without touching the log', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const res = await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 99 })
    expect(res).toMatchObject({ t: 'reject', reason: /fewer than 99/ })
    expect(await run.store.read(id)).toHaveLength(0)
  })

  it('answers malformed JSON and schema violations with error, not silence', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    a.sendRaw('{not json')
    expect(await a.waitFor((m) => m.t === 'error')).toMatchObject({ t: 'error', id: null })
    a.sendRaw(JSON.stringify({ t: 'envelope', envelope: { id: 'x', seat: 'A', intents: [{ v: 'teleport' }] } }))
    expect(await a.waitFor((m) => m.t === 'error' && m.id === 'x')).toMatchObject({ t: 'error', id: 'x' })
  })
})

describe('connections', () => {
  it('a reconnecting client gets a snapshot at the current seq', async () => {
    const id = await createSession(run.http)
    const table = await connect(id, null)
    await table.send(null, { v: 'draw', from: 'draw', to: 'table', count: 2 })
    const b1 = await connect(id, 'B')
    await b1.close()
    await table.send(null, { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    const b2 = await connect(id, 'B')
    expect(b2.view).toMatchObject({ seq: 2, seat: 'B' })
    expect(b2.view!.components.filter((c) => c.zone === 'hand:B')).toHaveLength(1)
  })

  it('an unknown session is refused', async () => {
    const c = await WireClient.connect(run.base, 'nope', null)
    clients.push(c)
    expect(c.messages[0]).toMatchObject({ t: 'error', message: /unknown session nope/ })
  })

  it('health reports loaded tables', async () => {
    const id = await createSession(run.http)
    await connect(id, null)
    const res = await fetch(`${run.http}/health`)
    expect(await res.json()).toEqual({ ok: true, tables: 1 })
  })
})

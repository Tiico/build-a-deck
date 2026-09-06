import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WireClient } from './client.js'
import { createSession, start, twoSeatSetup, type Running } from './fixture.js'
import { deck } from './deck.js'

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
    const beforeShuffle = b.frames.length
    await table.send(null, { v: 'shuffle', pile: 'draw' })
    await b.synced(3)
    expect(b.view!.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'count', count: 10 })
    // Seeing the card go onto the pile is fine (B could watch that); after the shuffle its id is gone.
    expect(b.frames.slice(beforeShuffle).join('\n')).not.toContain(known)
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

describe('activity on the wire', () => {
  it('tells every view what happened, without the outcome that would reveal a shuffle', async () => {
    const id = await createSession(run.http)
    const table = await connect(id, null)
    const b = await connect(id, 'B')
    await table.send(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await table.send(null, { v: 'shuffle', pile: 'draw' })

    const activity = await b.waitFor((m) => m.t === 'activity' && m.lines.some((l) => l.intent.v === 'shuffle'))
    if (activity.t !== 'activity') throw new Error('unreachable')
    expect(activity.lines.map((l) => [l.seq, l.by, l.intent.v])).toEqual([[2, null, 'shuffle']])
    expect(b.frames.join('\n')).not.toContain('rekey')
    expect(b.frames.join('\n')).not.toContain('outcome')
  })
})

describe('textures (TUNN-SKIVA §5)', () => {
  it('serves a face only through its hash, which only a seat that may see the face ever receives', async () => {
    const res = await fetch(`${run.http}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tex', version: 'v1', setup: twoSeatSetup(), deck }),
    })
    expect(res.status).toBe(201)
    const a = await connect('tex', 'A')
    const b = await connect('tex', 'B')
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await a.synced(1)
    await b.synced(1)

    const card = a.view!.components.find((c) => c.zone === 'hand:A')!
    expect(card.faces?.['front']).toMatch(/^[0-9a-f]{64}$/)
    expect(card.faces?.['back']).toMatch(/^[0-9a-f]{64}$/)
    const front = card.faces!['front']!
    expect(b.frames.join('\n')).not.toContain(front)

    // Queued but not yet rendered: come back later.
    expect((await fetch(`${run.http}/faces/${front}`)).status).toBe(202)
    expect((await fetch(`${run.http}/faces/${'0'.repeat(64)}`)).status).toBe(404)

    await run.renderAll()
    const png = await fetch(`${run.http}/faces/${front}`)
    expect(png.status).toBe(200)
    expect(png.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await png.arrayBuffer()).subarray(1, 4)).toEqual(new Uint8Array([0x50, 0x4e, 0x47]))
  }, 60_000)
})

describe('rewind on the wire (B)', () => {
  it('undo.self puts a drawn card back; the restored pile carries fresh ids so nobody can track it', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const table = await connect(id, null)
    await a.send('A', { v: 'shuffle', pile: 'draw' })
    const drawn = await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    expect(drawn.t).toBe('ack')
    const seen = (await a.synced(2)).components.find((c) => c.zone === 'hand:A')!
    expect(seen.cardRef).not.toBeNull()

    const undo = await a.send('A', { v: 'undo.self' })
    expect(undo.t).toBe('ack')
    const after = await table.synced(3)
    expect(after.zones.find((z) => z.id === 'hand:A')).toMatchObject({ count: 0 })
    expect(after.zones.find((z) => z.id === 'draw')).toMatchObject({ count: 10 })
    // The card's old id is gone from every view, and the outcome never crossed the wire.
    expect((await a.synced(3)).components.some((c) => c.id === seen.id)).toBe(false)
    expect(table.frames.some((f) => f.includes('"restore"') || f.includes('"table":'))).toBe(false)
  })

  it('a proposal shows on every view until the other seat confirms, and the actor survives a reload', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    const table = await connect(id, null)
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await b.send('B', { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    expect((await a.send('A', { v: 'undo.self' })).t).toBe('reject')

    expect((await a.synced(2)).undo).toEqual({ toSeq: 0, contested: true })
    await a.send('A', { v: 'rewind.propose', toSeq: 0 })
    expect((await table.synced(3)).rewind).toMatchObject({ toSeq: 0, by: 'A' })
    // The preview is projected per view: the table sees ten backs in the draw pile and no hands.
    const preview = (await table.synced(3)).rewind!.preview!
    expect(preview.zones.find((z) => z.id === 'draw')).toMatchObject({ count: 10 })
    expect(preview.components.every((c) => c.cardRef === null)).toBe(true)
    const proposal = (await b.synced(3)).rewind!
    expect((await b.send('B', { v: 'rewind.confirm', proposal: proposal.id })).t).toBe('ack')
    const restored = await table.synced(4)
    expect(restored.rewind).toBeNull()
    expect(restored.zones.find((z) => z.id === 'draw')).toMatchObject({ count: 10 })

    // A freshly loaded actor sees the same table.
    await run.restart()
    const again = await connect(id, null)
    expect(again.view).toEqual(restored)
  })
})

describe('presence (K6): an ephemeral channel beside the log', () => {
  it('relays what a connection says to every other connection at the table, never to itself, never into the log', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    const table = await connect(id, null)
    a.sendRaw(JSON.stringify({ t: 'presence', presence: { kind: 'cursor', x: 10, y: -20 } }))
    const seen = await b.waitFor((m) => m.t === 'presence')
    expect(seen).toMatchObject({ t: 'presence', from: { seat: 'A' }, presence: { kind: 'cursor', x: 10, y: -20 } })
    expect((await table.waitFor((m) => m.t === 'presence')).t).toBe('presence')
    expect(a.messages.some((m) => m.t === 'presence')).toBe(false)
    expect(await run.store.read(id)).toEqual([])

    // Two screens at the table are two senders, told apart by connection.
    const table2 = await connect(id, null)
    table2.sendRaw(JSON.stringify({ t: 'presence', presence: { kind: 'point', x: 0, y: 0 } }))
    const fromTable = await b.waitFor((m) => m.t === 'presence' && m.presence.kind === 'point')
    expect(fromTable.t === 'presence' && fromTable.from.seat).toBeNull()
    expect(fromTable.t === 'presence' && fromTable.from.id).not.toBe(seen.t === 'presence' ? seen.from.id : '')

    // Leaving sends the others an `away`, so no cursor lingers.
    await a.close()
    const away = await b.waitFor((m) => m.t === 'presence' && m.presence.kind === 'away')
    expect(away).toMatchObject({ from: { seat: 'A' } })
    expect(await run.store.read(id)).toEqual([])
  })
})

describe('the observer (C8): sees everything, is seen by everyone, touches nothing', () => {
  it('a connection with role=observer gets every hand and hidden pile; the roster tells the table who watches', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const table = await connect(id, null)
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 2 })

    const eva = await WireClient.connect(run.base, id, null, { role: 'observer', name: 'Eva' })
    clients.push(eva)
    const hand = eva.view!.components.filter((c) => c.zone === 'hand:A')
    expect(hand.map((c) => c.cardRef)).toEqual([expect.any(String), expect.any(String)])
    expect(eva.view!.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'order' })
    const roster = await table.waitFor((m) => m.t === 'roster' && m.observers.length > 0)
    expect(roster).toMatchObject({ t: 'roster', observers: [{ name: 'Eva' }] })
    // A latecomer learns of her too.
    const b = await connect(id, 'B')
    expect((await b.waitFor((m) => m.t === 'roster'))).toMatchObject({ observers: [{ name: 'Eva' }] })

    // She may flag, stamped with her name, and nothing else.
    const flagged = await eva.send(null, { v: 'flag', note: 'Ada tvekade länge' })
    expect(flagged.t).toBe('ack')
    const log = await run.store.read(id)
    expect(log.at(-1)).toMatchObject({ by: null, intent: { v: 'flag', note: 'Ada tvekade länge', observer: 'Eva' } })
    expect((await eva.send(null, { v: 'draw', from: 'draw', to: 'table', count: 1 })).t).toBe('reject')
    // A player cannot pose as an observer on a flag.
    await a.send('A', { v: 'flag', observer: 'Eva' })
    expect((await run.store.read(id)).at(-1)?.intent).toEqual({ v: 'flag' })

    await eva.close()
    expect(await table.waitFor((m) => m.t === 'roster' && m.observers.length === 0)).toBeTruthy()
  })
})

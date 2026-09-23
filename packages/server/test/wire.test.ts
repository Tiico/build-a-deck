import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WireClient } from './client.js'
import { createSession, registerRoom, start, twoSeatSetup, type Running } from './fixture.js'
import { MemoryLogStore } from '../src/index.js'
import { deck } from './deck.js'
import { MemoryObjectStore } from '@byd/render'
import type { ObjectStore } from '@byd/render/queue'

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

// Admitted the way a real connection is (DRIFT §9): the table with the host key, a seat with
// a token bought for it.
async function connect(sessionId: string, seat: string | null, as?: { role: 'observer'; name: string }): Promise<WireClient> {
  const c = await run.connect(sessionId, seat, as)
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

  it('the top of the draw pile turned face-up is read by everyone, and vanishes from the wire once drawn into a hand (K15)', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    const table = await connect(id, null)

    await a.send('A', { v: 'flip', component: { top: 'draw' }, face: 'front' })
    for (const c of [a, b, table]) {
      await c.synced(1)
      const draw = c.view!.zones.find((z) => z.id === 'draw')!
      expect(draw).toMatchObject({ mode: 'count', count: 10, top: expect.any(String) })
      expect(c.view!.components.filter((x) => x.zone === 'draw')).toEqual([expect.objectContaining({ cardRef: 'dragon', face: 'front' })])
    }

    const before = b.frames.length
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await b.synced(2)
    await table.synced(2)
    expect(b.view!.zones.find((z) => z.id === 'draw')).not.toHaveProperty('top')
    expect(b.view!.components).toHaveLength(0)
    expect(b.frames.slice(before).join('\n')).not.toMatch(/dragon/)
    expect(table.view!.components).toHaveLength(0)
    await a.synced(2)
    expect(a.view!.components.filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)).toEqual(['dragon'])
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
    // The card's own journey onto the pile is B's to watch, and the activity line names the
    // component it moved. That frame must be *behind* the mark, or this test is timing and not
    // visibility: under load it arrives after the shuffle has been asked for and then trips the
    // assertion below, which is how it flaked (#51). Waiting for it is also what states the
    // rule out loud — the id may be seen going in, and is gone once the pile is shuffled.
    await b.synced(2)
    // Matched as the whole JSON string the id always travels as, quotes and all, and not as a
    // bare substring. `c0` is two characters, and two characters turn up by chance inside the
    // other text a frame carries — an envelope's random nonce is six base-36 characters, so
    // roughly one run in two hundred and sixty used to fail here with a real leak's exact shape
    // and no leak behind it. The e2e suite learnt this the same way and says so in `mentions`.
    expect(b.frames.join('\n')).toContain(JSON.stringify(known))
    const beforeShuffle = b.frames.length
    await table.send(null, { v: 'shuffle', pile: 'draw' })
    await b.synced(3)
    expect(b.view!.zones.find((z) => z.id === 'draw')).toMatchObject({ mode: 'count', count: 10 })
    // Seeing the card go onto the pile is fine (B could watch that); after the shuffle its id is gone.
    expect(b.frames.slice(beforeShuffle).join('\n')).not.toContain(JSON.stringify(known))
  })

  // Har något hänt vid bordet (#452): uppgiften startbrickan frågar sin bekräftelse på. Den är
  // publik — att någon rört ett kort är lika öppet som att en hög blandades — och den säger
  // ingenting mer än det. Läst på råa frames, som allt annat om vad tråden bär (B6).
  it('säger på tråden att något hänt vid bordet, och inte vad, när ett kort rörts', async () => {
    const id = await createSession(run.http)
    const a = await connect(id, 'A')
    const b = await connect(id, 'B')
    // Två anslutna spelare och inget rört kort: bordet står som uppställningen lade det.
    expect(a.view!.played).toBe(false)
    expect(b.view!.played).toBe(false)
    const beforeDraw = b.frames.length

    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await b.synced(1)
    expect(b.view!.played).toBe(true)
    // B ser att något hänt utan att se vad: kortet som drogs till A:s hand når aldrig B.
    const frames = b.frames.slice(beforeDraw).join('\n')
    expect(frames).toContain('"played":true')
    expect(frames).not.toContain(JSON.stringify(a.view!.components[0]!.id))
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
    const token = await run.admit(id, 'B')
    const reconnect = async () => {
      const client = await WireClient.connect(run.base, id, 'B', undefined, { token })
      clients.push(client)
      return client
    }
    const b1 = await reconnect()
    await b1.close()
    await table.send(null, { v: 'draw', from: 'draw', to: 'hand:B', count: 1 })
    const b2 = await reconnect()
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
    expect(await res.json()).toEqual({ ok: true, tables: 1, store: 'ok' })
  })

  // What the box runs is not written anywhere it can be read from outside (DRIFT §8 leaves it
  // with docker logs alone), so a deploy could only be verified by fingerprinting the bundle it
  // serves. The release the box was started with is the one thing it knows about itself.
  it('health names the release the box was told it is running', async () => {
    await run.stop()
    run = await start({ release: 'v0.8.0' })
    const res = await fetch(`${run.http}/health`)
    expect(await res.json()).toEqual({ ok: true, release: 'v0.8.0', tables: 0, store: 'ok' })
  })

  // A 503 is when the question is asked in earnest, and "which version is broken" is the first
  // thing asked back. A marker that only the healthy answer carries is missing where it counts.
  it('names it in the answer that says something is wrong, too', async () => {
    await run.stop()
    const objects = new MemoryObjectStore()
    const unreachable: ObjectStore = {
      put: objects.put.bind(objects),
      get: objects.get.bind(objects),
      link: async (key: string, ttl: number) => `https://r2.test/byd-assets/${key}?X-Amz-Expires=${ttl}`,
      check: async () => {
        throw new Error('bucket byd-assets: 503')
      },
    }
    run = await start({ release: 'v0.8.0', objects: unreachable })
    const sick = await fetch(`${run.http}/health`)
    expect(sick.status).toBe(503)
    expect(await sick.json()).toMatchObject({ ok: false, release: 'v0.8.0', assets: 'bucket byd-assets: 503' })
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

  it('a view that connects mid-game gets the last fifty lines with its snapshot, redacted alike', async () => {
    const id = await createSession(run.http)
    const table = await connect(id, null)
    await table.send(null, { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await table.send(null, { v: 'shuffle', pile: 'draw' })
    for (let i = 0; i < 51; i++) await table.send(null, { v: 'flag', note: `moment ${i}` })

    const late = await connect(id, 'B')
    const snapshot = late.messages.find((m) => m.t === 'snapshot')
    if (snapshot?.t !== 'snapshot') throw new Error('no snapshot')
    expect(snapshot.activity).toHaveLength(50)
    expect(snapshot.activity[0]).toMatchObject({ seq: 4, intent: { v: 'flag', note: 'moment 1' } })
    expect(snapshot.activity.at(-1)).toMatchObject({ seq: 53, by: null })
    expect(late.frames.join('\n')).not.toContain('outcome')

    // A fresh table: nothing has happened yet.
    const empty = await connect(await createSession(run.http, 's2'), null)
    const first = empty.messages.find((m) => m.t === 'snapshot')
    expect(first?.t === 'snapshot' ? first.activity : null).toEqual([])
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
    registerRoom('tex', (await res.json()) as { code: string; hostKey: string })
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

  // A face-down pile wears a back, and wearing it must not be a way of naming what is under it
  // (#313, B6). Read off the frames themselves and not off the shape the client happens to build:
  // the back hash is there, and the top card's front hash, its id and any cardRef are not.
  it('gives a face-down pile a back on the wire and still nothing that says which card it is', async () => {
    const res = await fetch(`${run.http}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'tex-back', version: 'v1', setup: twoSeatSetup(), deck }),
    })
    expect(res.status).toBe(201)
    registerRoom('tex-back', (await res.json()) as { code: string; hostKey: string })
    const a = await connect('tex-back', 'A')
    const table = await connect('tex-back', null)

    // Draw one so A holds a card whose front hash is known — that hash is what must not appear in
    // the table's frames, even though the pile it came from now shows a back.
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await a.synced(1)
    await table.synced(1)

    const pile = table.view!.zones.find((z) => z.id === 'draw')!
    expect(pile.mode).toBe('count')
    expect(pile.mode === 'count' && pile.back).toMatch(/^[0-9a-f]{64}$/)

    const drawn = a.view!.components.find((c) => c.zone === 'hand:A')!
    const front = drawn.faces!['front']!
    const frames = table.frames.join('\n')
    expect(frames).not.toContain(front)
    expect(frames).not.toMatch(/dragon|knight|wizard/)
    expect(componentsOnWire(table).filter((c) => c.zone === 'draw')).toHaveLength(0)
  }, 60_000)
})

// The one repair a player has at the table is the card's own "Försök igen" (#10). A plain
// re-fetch cannot help a job the render container gave up on, so the ask has to reach the queue.
describe('a face whose render died (#10)', () => {
  it('stays 500 however often it is fetched, and goes back in the queue when the player asks', async () => {
    const res = await fetch(`${run.http}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'dead', version: 'v1', setup: twoSeatSetup(), deck }),
    })
    expect(res.status).toBe(201)
    registerRoom('dead', (await res.json()) as { code: string; hostKey: string })
    const a = await connect('dead', 'A')
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const front = (await a.synced(1)).components.find((c) => c.zone === 'hand:A')!.faces!['front']!

    const job = (await run.renders.claim(Date.now()))!
    await run.renders.fail(job.hash, 'chromium gave up')
    expect((await fetch(`${run.http}/faces/${job.hash}`)).status).toBe(500)
    // Busting the cache is not asking again; the job is still dead.
    expect((await fetch(`${run.http}/faces/${job.hash}?t=3`)).status).toBe(500)
    expect((await run.renders.status(job.hash))?.state).toBe('failed')

    expect((await fetch(`${run.http}/faces/${job.hash}?retry=1`)).status).toBe(202)
    expect((await run.renders.status(job.hash))?.state).toBe('queued')
    expect(front).toMatch(/^[0-9a-f]{64}$/)
    // A hash nobody ever queued is still unknown; a retry does not invent a job.
    expect((await fetch(`${run.http}/faces/${'0'.repeat(64)}?retry=1`)).status).toBe(404)
  })
})

describe('faces in R2 (DRIFT §4)', () => {
  it('answers a rendered face with a redirect to a short-lived link the browser caches, and /health asks the store', async () => {
    await run.stop()
    const objects = new MemoryObjectStore()
    let reachable = true
    const r2 = {
      put: objects.put.bind(objects),
      get: objects.get.bind(objects),
      link: async (key: string, ttl: number) => `https://r2.test/byd-assets/${key}?X-Amz-Expires=${ttl}`,
      check: async () => {
        if (!reachable) throw new Error('bucket byd-assets: 503')
      },
    }
    run = await start({ objects: r2 })
    const res = await fetch(`${run.http}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'r2', version: 'v1', setup: twoSeatSetup(), deck }) })
    expect(res.status).toBe(201)
    registerRoom('r2', (await res.json()) as { code: string; hostKey: string })
    const a = await connect('r2', 'A')
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    const front = (await a.synced(1)).components.find((c) => c.zone === 'hand:A')!.faces!['front']!
    expect((await fetch(`${run.http}/faces/${front}`)).status).toBe(202)

    await run.renderAll()
    const face = await fetch(`${run.http}/faces/${front}`, { redirect: 'manual' })
    expect(face.status).toBe(302)
    expect(face.headers.get('location')).toBe(`https://r2.test/byd-assets/renders/${front}?X-Amz-Expires=3600`)
    expect(face.headers.get('cache-control')).toBe('private, max-age=3000')
    expect(await objects.get(`renders/${front}`)).not.toBeNull()

    expect((await fetch(`${run.http}/health`)).status).toBe(200)
    reachable = false
    const sick = await fetch(`${run.http}/health`)
    expect(sick.status).toBe(503)
    expect(await sick.json()).toMatchObject({ ok: false, assets: 'bucket byd-assets: 503' })
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

    const eva = await connect(id, null, { role: 'observer', name: 'Eva' })
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

// A seat that taps as the table comes up (#109). The socket is open before the door has finished
// asking the store which session this is and whether this token buys a seat at it, and a frame
// that arrives in that window had no `message` listener to be delivered to: it was emitted to
// nobody and lost without an ack, a reject or an error. The player saw a card that did not move
// and nothing anywhere said why.
//
// The store is slow here for the same reason it is slow in life: the real one is a database on
// the other side of a socket, and this is what the door does while it waits for it.
class SlowLog extends MemoryLogStore {
  override async loadSession(id: string): Promise<Awaited<ReturnType<MemoryLogStore['loadSession']>>> {
    await new Promise((r) => setTimeout(r, 20))
    return super.loadSession(id)
  }
}

describe('an intent sent the moment the socket opens', () => {
  it('waits for the door to finish opening instead of being dropped', async () => {
    await run.stop()
    run = await start({ store: new SlowLog() })
    const id = await createSession(run.http)
    const token = await run.admit(id, 'A')
    // Not the fixture's `connect`, which waits for the snapshot first: this is the seat that
    // does not wait, because the finger was already on its way down.
    const c = await WireClient.opened(run.base, id, 'A', undefined, { token })
    clients.push(c)
    c.sendRaw(JSON.stringify({ t: 'envelope', envelope: { id: 'e1', seat: 'A', intents: [{ v: 'draw', from: 'draw', to: 'hand:A', count: 1 }] } }))
    // Whatever the answer is, there has to be one: the frame must not be met with silence.
    const answer = await c.waitFor((m) => (m.t === 'ack' || m.t === 'reject' || m.t === 'error') && m.id === 'e1')
    expect(answer.t).toBe('ack')
  })
})

// Högens bottenkort på tråden (K23, #331). Ett nedvänt bottenkort är dold information som allt
// annat i en dold hög: zonen säger att det finns och vilken baksida det bär, och inget mer — inget
// id, inget cardRef, ingen framsidas hash. Ett uppvänt är publikt som en uppvänd topp (K15) och
// namnges. Läst på råa frames och inte på vyn klienten bygger.
describe('the bottom card of a pile on the wire (K23)', () => {
  const withBottom = (face: 'front' | 'back') => {
    const setup = twoSeatSetup()
    return { ...setup, zones: setup.zones.map((z) => (z.id === 'draw' ? { ...z, bottom: { cardRef: 'ogre', face } } : z)) }
  }
  const open = async (id: string, face: 'front' | 'back') => {
    const res = await fetch(`${run.http}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, version: 'v1', setup: withBottom(face), deck }),
    })
    expect(res.status).toBe(201)
    registerRoom(id, (await res.json()) as { code: string; hostKey: string })
  }

  it('a face-down bottom card leaks neither its cardRef nor its front: only a back hash crosses', async () => {
    await open('bottom-down', 'back')
    const a = await connect('bottom-down', 'A')
    const table = await connect('bottom-down', null)
    await table.synced(0)
    const pile = table.view!.zones.find((z) => z.id === 'draw')!
    expect(pile.mode).toBe('count')
    expect(pile.bottom).toBeDefined()
    expect(pile.bottom?.id).toBeUndefined()
    expect(pile.bottom?.back).toMatch(/^[0-9a-f]{64}$/)

    // A draws the whole pile: the bottom card ends in A's hand with its front, and that hash and
    // that name have still never crossed to the table.
    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 10 })
    await a.synced(1)
    await table.synced(1)
    const ogre = a.view!.components.find((c) => c.zone === 'hand:A' && c.cardRef === 'ogre')!
    const front = ogre.faces!['front']!
    const frames = table.frames.join('\n')
    expect(frames).not.toContain(front)
    expect(frames).not.toContain('ogre')
    expect(componentsOnWire(table).filter((c) => c.zone === 'draw')).toHaveLength(0)
  }, 60_000)

  it('a face-up bottom card is named to everyone, like a face-up top', async () => {
    await open('bottom-up', 'front')
    const table = await connect('bottom-up', null)
    await table.synced(0)
    const pile = table.view!.zones.find((z) => z.id === 'draw')!
    expect(pile.mode === 'count' && pile.bottom?.id).toMatch(/^c\d+$/)
    const shown = componentsOnWire(table).filter((c) => c.zone === 'draw')
    expect(shown).toHaveLength(1)
    expect(shown[0]).toMatchObject({ id: pile.bottom!.id, cardRef: 'ogre', face: 'front' })
    expect(shown[0]!.faces?.['front']).toMatch(/^[0-9a-f]{64}$/)
  }, 60_000)
})

// What a card is called out loud is the row's title and not its id (#412). The title rides beside
// `cardRef` in the projection, which makes it hidden information that follows the zone's
// visibility exactly as the face does (B6). The proof is the frames themselves and never the
// screen (D4): a title that never crossed the wire cannot be read aloud anywhere.
describe('a card is called by its title, and the title is hidden information (#412, B6)', () => {
  const titles: Record<string, string> = { dragon: 'Björnen', knight: 'Räven', wizard: 'Älgen' }
  const titled = { ...deck, rows: Object.fromEntries(Object.entries(deck.rows).map(([id, row]) => [id, { ...row, ...(titles[id] === undefined ? {} : { title: titles[id] })  }])) }
  const NOT_THEIRS = /Björnen|Räven|Älgen/

  it('sends the title to the seat holding the card and to nobody else — verified on raw frames', async () => {
    const res = await fetch(`${run.http}/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'titles', version: 'v1', setup: twoSeatSetup(), deck: titled }),
    })
    expect(res.status).toBe(201)
    registerRoom('titles', (await res.json()) as { code: string; hostKey: string })
    const a = await connect('titles', 'A')
    const b = await connect('titles', 'B')
    const table = await connect('titles', null)

    await a.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 1 })
    await a.synced(1)
    await b.synced(1)
    await table.synced(1)

    // Ada holds Björnen and is told so: the card she may see carries its title beside its id.
    expect(a.view!.components.find((c) => c.zone === 'hand:A')).toMatchObject({ cardRef: 'dragon', title: 'Björnen' })
    expect(a.frames.join('\n')).toContain('Björnen')

    // And nobody else was told anything: not the other seat, not the table.
    for (const other of [b, table]) {
      expect(other.frames.join('\n')).not.toMatch(NOT_THEIRS)
      expect(componentsOnWire(other).filter((c) => c.title !== undefined)).toHaveLength(0)
    }
  }, 60_000)
})

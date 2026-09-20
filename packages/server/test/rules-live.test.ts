import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ServerMessage, type Snapshot } from '@byd/protocol'
import { applyPatch, zoneTally } from '@byd/engine'
import { WireClient } from './client.js'
import { CARDS, createSession, start, type Running } from './fixture.js'

// The living number in the rulebook (#226), proved where this repo proves anything hidden: on the
// raw frames, never on a screen.
//
// The reason is exact and worth restating here. The badge beside `Draghögen` in the book is drawn
// from a view held in a browser, and a view in a browser can hold whatever was sent to it — a
// field added next month carrying the whole pile, a debug echo, a projection that forgot a seat.
// A test that opened the drawer and read `18` off the DOM would pass for every one of those,
// because `18` is the right answer in all of them. Only the bytes can say *what the answer was
// made of*: whether the reader was told the count alone, which is public and always was (K15,
// «a count and nothing else»), or was also told the order and the cards, which is the leak.
//
// So each reader's view is rebuilt here from the frames that reader actually received, and the
// badge's own function — `zoneTally`, the very one the book calls — is asked the question off
// that rebuild. What the badge could possibly show is then bounded by what crossed the wire, and
// not by what the server happened to know.
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
  const c = await run.connect(sessionId, seat)
  clients.push(c)
  return c
}

// One reader's table, assembled out of the bytes that reader was sent and nothing else. This is
// deliberately not `client.view`: the point is that the reading starts at the frames.
function tableFromFrames(frames: readonly string[]): Snapshot {
  let view: Snapshot | null = null
  for (const frame of frames) {
    const msg = ServerMessage.parse(JSON.parse(frame))
    if (msg.t === 'snapshot') view = msg.snapshot
    else if (msg.t === 'patch' && view) view = applyPatch(view, msg.patch)
  }
  if (!view) throw new Error('this reader was sent no table at all')
  return view
}

describe('what the book’s living number is allowed to be made of (#226)', () => {
  it('reads a hidden pile as a count and never as a reading, off the frames themselves', async () => {
    const id = await createSession(run.http)
    const ada = await connect(id, 'A')
    const bo = await connect(id, 'B')
    const table = await connect(id, null)
    await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await Promise.all([ada.synced(1), bo.synced(1), table.synced(1)])

    // Non-vacuity first, and not as a formality: a badge test that could never be filled proves
    // nothing about the hollow one. Ada's own hand is a reading, and the book would fill it.
    expect(zoneTally(tableFromFrames(ada.frames), 'hand:A')).toEqual({ count: 3, known: true })

    // And now the hidden cases, each of them hollow, each of them off that reader's own bytes.
    for (const c of [bo, table]) {
      const seen = tableFromFrames(c.frames)
      expect(zoneTally(seen, 'hand:A'), 'another hand is counted and not read').toEqual({ count: 3, known: false })
      expect(zoneTally(seen, 'draw'), 'the deck is counted and not read').toEqual({ count: 7, known: false })
      // The count is on the wire on purpose, so the badge showing it is not the leak. What must
      // not be there is what the pile is made of.
      expect(seen.zones.find((z) => z.id === 'draw')).not.toHaveProperty('order')
      expect(seen.components.filter((v) => v.zone === 'draw' || v.zone === 'hand:A')).toHaveLength(0)
    }
  })

  it('never tells a reader where a card lies, so a card reference has nothing to show', async () => {
    const id = await createSession(run.http)
    const ada = await connect(id, 'A')
    const bo = await connect(id, 'B')
    await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await bo.synced(1)

    // What the book could say about `[[kort:vargen]]` is where the Wolf lies. Bo is never told
    // that about any card in the deck or in Ada's hand — the identity is not in his bytes at all,
    // matched as the whole JSON string it always travels as so that `bard` is not found inside
    // `bards`. So the decision that a card reference gets no living layer (open question 3) is
    // not a restraint the book exercises; there is nothing there for it to show.
    const held = tableFromFrames(ada.frames).components.filter((c) => c.zone === 'hand:A')
    expect(held.map((c) => c.cardRef), 'Ada knows her own three cards').toHaveLength(3)
    expect(held.every((c) => c.cardRef !== null)).toBe(true)
    for (const card of CARDS) expect(bo.frames.filter((f) => f.includes(JSON.stringify(card))), `Bo was sent ${card}`).toHaveLength(0)
  })
})

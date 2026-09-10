import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoom, start, type Running } from './fixture.js'
import { WireClient } from './client.js'

// Leaving a table (#31). The move is one the closed vocabulary already has — `seat.release`,
// which the engine answers by giving the hand back to the setup's return pile — so nothing here
// is about a new verb. What is about the server is the other half of a seat: the token that was
// bought for it. A seat the engine calls free that the door still holds a reservation for is not
// free to anybody, and leaving would be a way out of the table but not out of the seat.
//
// The frames are the evidence, as they are for hidden information (CLAUDE.md): what crossed the
// wire, and what the door answers afterwards.

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

const post = (path: string, body: unknown) =>
  fetch(`${run.http}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

const keep = <T extends WireClient>(c: T): T => {
  clients.push(c)
  return c
}

describe('a seat leaves the table (#31)', () => {
  it('releases itself with seat.release, and the seat is free for the next guest to buy', async () => {
    const { id, code, hostKey } = await createRoom(run.http)
    const token = ((await (await post(`/rooms/${code}/join`, { name: 'Ada', seat: 'A' })).json()) as { token: string }).token
    const ada = keep(await WireClient.connect(run.base, id, 'A', undefined, { token }))
    const table = keep(await run.connectTable(id, hostKey))
    await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })

    const ack = await ada.send('A', { v: 'seat.release', seat: 'A' })
    expect(ack).toMatchObject({ t: 'ack' })

    // What the table was told, read off the frames: the seat is empty and the three cards are
    // back in the pile they came from.
    await table.synced(3)
    expect(table.view?.seats.find((s) => s.id === 'A')).toMatchObject({ name: null })
    expect(table.view?.zones.find((z) => z.id === 'draw')).toMatchObject({ count: 10 })
    const activity = table.messages.flatMap((m) => (m.t === 'activity' ? m.lines : []))
    expect(activity.map((line) => line.intent.v)).toContain('seat.release')

    // And the door agrees: somebody else can buy the seat that was left.
    expect((await post(`/rooms/${code}/join`, { name: 'Bo', seat: 'A' })).status).toBe(201)
  })

  // The other half of the same sentence, and the one that must not change: losing the net is not
  // leaving. A closed socket drops presence and nothing else, so the same ticket comes back to
  // the same seat with the same cards in hand, and nobody could have taken the seat meanwhile.
  it('is not what losing the net does: the same ticket comes back to the same seat and the same hand', async () => {
    const { id, code } = await createRoom(run.http)
    const token = ((await (await post(`/rooms/${code}/join`, { name: 'Ada', seat: 'A' })).json()) as { token: string }).token
    const ada = await WireClient.connect(run.base, id, 'A', undefined, { token })
    await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    await ada.synced(2)
    const held = ada.view?.components.filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)
    expect(held).toHaveLength(3)

    // The phone goes into a pocket, or the lift eats the signal.
    await ada.close()
    expect((await post(`/rooms/${code}/join`, { name: 'Bo', seat: 'A' })).status).toBe(409)

    const back = keep(await WireClient.connect(run.base, id, 'A', undefined, { token }))
    expect(back.view?.seats.find((s) => s.id === 'A')).toMatchObject({ name: 'Ada' })
    expect(back.view?.components.filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)).toEqual(held)
    expect(back.frames.join('\n')).not.toMatch(/seat\.release/)
  })
})

// A seat has a third half beside the log and the door, and it is the one the rule in CLAUDE.md is
// about: the sockets that were sitting at it. A connection is projected by the seat it was
// admitted to, so a socket whose seat has been given up still reads as that seat — and the next
// guest's hand is dealt straight into it. `kick` knew to hang up; leaving did not. The evidence
// is the raw frames, on the wire, where hidden information is decided (D1).
describe('the socket that left (D1)', () => {
  it('is dealt nothing more once the next guest has the seat', async () => {
    const { id } = await createRoom(run.http)
    const ada = keep(await WireClient.connect(run.base, id, 'A', undefined, { token: await run.admit(id, 'A', 'Ada') }))
    await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    expect((await ada.send('A', { v: 'seat.release', seat: 'A' })).t).toBe('ack')
    // Ada's phone has gone nowhere: the socket is held open on purpose, which is what a blocked
    // navigation, a back button, or any way out that does not load a new page really does.
    const mark = ada.frames.length

    const bo = keep(await WireClient.connect(run.base, id, 'A', undefined, { token: await run.admit(id, 'A', 'Bo') }))
    await bo.send('A', { v: 'seat.claim', seat: 'A', name: 'Bo' })
    await bo.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })
    const held = (bo.view?.components ?? []).filter((c) => c.zone === 'hand:A').map((c) => c.cardRef)
    expect(held).toHaveLength(3)
    expect(held.every((ref) => typeof ref === 'string')).toBe(true)

    // The control, without which seeing nothing would prove nothing: Bo's own socket did carry
    // the three cards across the wire.
    for (const ref of held) expect(bo.frames.join('\n')).toContain(ref)
    // And the proof: not one of them ever reached the socket that left.
    for (const ref of held) expect(ada.frames.slice(mark).join('\n')).not.toContain(ref)
  })
})

// What an ack says. It says one thing: the line is in the log. Everything emptying a seat means
// beyond that — the reservation at the door, the sockets — follows the commit and cannot undo
// it: the log is append-only and the shuffle that put the hand back is already stored as a
// result. So a door that will not answer must not be able to turn an accepted move into a
// refusal, or the phone stands at a table it has already left, holding a hand that has already
// gone back in the pile. It must not be quietly swallowed either: a live token for a seat the
// table shows as free is the next guest's 409, and only the box can fix it (DRIFT §8).
describe('a door that will not answer', () => {
  it('does not take back the ack for a release the log already has', async () => {
    const { id } = await createRoom(run.http)
    const ada = keep(await WireClient.connect(run.base, id, 'A', undefined, { token: await run.admit(id, 'A', 'Ada') }))
    await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await ada.send('A', { v: 'draw', from: 'draw', to: 'hand:A', count: 3 })

    const said: string[] = []
    const watched = vi.spyOn(console, 'error').mockImplementation((line: unknown) => void said.push(String(line)))
    run.store.revokeGuests = () => Promise.reject(new Error('the door is not answering'))
    try {
      expect((await ada.send('A', { v: 'seat.release', seat: 'A' })).t).toBe('ack')
    } finally {
      watched.mockRestore()
    }

    // The ack was true, which is why it stands: the seat is empty and the hand is back.
    expect((await run.store.read(id)).at(-1)?.intent).toMatchObject({ v: 'seat.release', seat: 'A' })
    // And the half that failed is on the record, with the table and the seat it is about.
    expect(said.join('\n')).toContain('the door is not answering')
    expect(said.join('\n')).toContain(id)
    expect(said.join('\n')).toContain('"A"')
  })
})

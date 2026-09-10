import { afterEach, beforeEach, describe, expect, it } from 'vitest'
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

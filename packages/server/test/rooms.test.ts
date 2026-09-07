import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoom, start, twoSeatSetup, type Running } from './fixture.js'
import { WireClient } from './client.js'
import { template } from './deck.js'

// Room codes (DRIFT §9): short, without confusable characters, resolving to a session for a
// few hours after the last connection, and the host's key that opens the table's own view.
let run: Running
let now = new Date('2026-09-07T10:00:00Z')
beforeEach(async () => {
  now = new Date('2026-09-07T10:00:00Z')
  run = await start({ now: () => now })
})
afterEach(async () => {
  await run.stop()
})

const CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/

describe('room codes', () => {
  it('a new session gets a six-character code without confusable characters, and a host key', async () => {
    const res = await fetch(`${run.http}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', setup: twoSeatSetup() }) })
    expect(res.status).toBe(201)
    const made = (await res.json()) as { id: string; code: string; hostKey: string }
    expect(made.code).toMatch(CODE)
    expect(made.hostKey.length).toBeGreaterThanOrEqual(32)
    const again = (await (await fetch(`${run.http}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'v1', setup: twoSeatSetup() }) })).json()) as { code: string; hostKey: string }
    expect(again.code).not.toBe(made.code)
    expect(again.hostKey).not.toBe(made.hostKey)
  })

  it('resolves to the session, forgiving case and spaces, and knows nothing about codes that do not exist', async () => {
    const { id, code } = await createRoom(run.http)
    const found = await fetch(`${run.http}/rooms/${code.toLowerCase()}`)
    expect(found.status).toBe(200)
    expect(await found.json()).toEqual({ session: id })
    expect((await fetch(`${run.http}/rooms/${encodeURIComponent(`${code.slice(0, 3)} ${code.slice(3)}`)}`)).status).toBe(200)
    expect((await fetch(`${run.http}/rooms/ZZZZZZ`)).status).toBe(404)
    expect((await fetch(`${run.http}/rooms/${id}`)).status).toBe(404)
  })

  it('goes out three hours after the last connection, and a connection brings it back to life', async () => {
    const { code, hostKey, id } = await createRoom(run.http)
    now = new Date(now.getTime() + 2 * 3600_000)
    expect((await fetch(`${run.http}/rooms/${code}`)).status).toBe(200)
    // The table is switched on: the code lives three more hours from now.
    const tv = await run.connectTable(id, hostKey)
    now = new Date(now.getTime() + 2 * 3600_000)
    expect((await fetch(`${run.http}/rooms/${code}`)).status).toBe(200)
    await tv.close()
    now = new Date(now.getTime() + 3 * 3600_000 + 1)
    expect((await fetch(`${run.http}/rooms/${code}`)).status).toBe(404)
  })
})

const post = (http: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(`${http}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })

describe('guest tokens', () => {
  it('reserves a seat atomically when two guests join at the same time', async () => {
    const { code } = await createRoom(run.http)
    const attempts = await Promise.all([
      post(run.http, `/rooms/${code}/join`, { name: 'Ada', seat: 'A' }),
      post(run.http, `/rooms/${code}/join`, { name: 'Bo', seat: 'A' }),
    ])
    expect(attempts.map((res) => res.status).sort()).toEqual([201, 409])
  })

  it('a code and a name buy a token for a free seat; unknown codes and seats, and taken seats, refuse', async () => {
    const { id, code } = await createRoom(run.http)
    const joined = await post(run.http, `/rooms/${code.toLowerCase()}/join`, { name: 'Ada', seat: 'A' })
    expect(joined.status).toBe(201)
    const { session, token } = (await joined.json()) as { session: string; token: string }
    expect(session).toBe(id)
    expect(token.length).toBeGreaterThanOrEqual(32)
    expect((await post(run.http, '/rooms/ZZZZZZ/join', { name: 'Ada', seat: 'A' })).status).toBe(404)
    expect((await post(run.http, `/rooms/${code}/join`, { name: 'Ada', seat: 'Q' })).status).toBe(404)
    expect((await post(run.http, `/rooms/${code}/join`, { seat: 'A' })).status).toBe(400)

    const a = await WireClient.connect(run.base, id, 'A', undefined, { token })
    expect((await a.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })).t).toBe('ack')
    expect((await post(run.http, `/rooms/${code}/join`, { name: 'Bo', seat: 'A' })).status).toBe(409)
    expect((await post(run.http, `/rooms/${code}/join`, { name: 'Bo', seat: 'B' })).status).toBe(201)
    await a.close()
  })

  it('a seat connects only with its own token; the table only with the host key; a lobby may look but not act', async () => {
    const { id, code, hostKey } = await createRoom(run.http)
    const { token } = (await (await post(run.http, `/rooms/${code}/join`, { name: 'Ada', seat: 'A' })).json()) as { token: string }

    const refused = async (seat: string | null, auth?: { host?: string; token?: string }, as?: { role: 'observer'; name: string }) => {
      const c = await WireClient.connect(run.base, id, seat, as, auth)
      const first = c.messages[0]
      await c.close()
      return first?.t === 'refused' ? first.reason : `not refused: ${first?.t}`
    }
    expect(await refused('A')).toBe('a seat needs its token')
    expect(await refused('A', { token: 'nope' })).toBe('a seat needs its token')
    expect(await refused('B', { token })).toBe('a seat needs its token')
    expect(await refused(null)).toBe('the table needs the host key')
    expect(await refused(null, { host: 'nope' })).toBe('the table needs the host key')
    expect(await refused(null, undefined, { role: 'observer', name: 'Eva' })).toBe('an observer needs a token')

    const tv = await run.connectTable(id, hostKey)
    expect(tv.messages[0]?.t).toBe('snapshot')
    const a = await WireClient.connect(run.base, id, 'A', undefined, { token })
    expect(a.messages[0]?.t).toBe('snapshot')

    // The lobby (the join page) sees the seats live and may not act.
    const lobby = await WireClient.connect(run.base, id, null, { role: 'lobby' })
    expect(lobby.messages[0]?.t).toBe('snapshot')
    await a.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })
    await lobby.synced(1)
    expect(lobby.view?.seats.find((s) => s.id === 'A')?.name).toBe('Ada')
    const rejected = await lobby.send(null, { v: 'seat.release', seat: 'A' })
    expect(rejected).toMatchObject({ t: 'reject', reason: 'a lobby may only look' })
    lobby.sendRaw(JSON.stringify({ t: 'presence', presence: { kind: 'point', x: 777, y: 888 } }))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(tv.messages.some((message) => message.t === 'presence' && message.presence.kind === 'point' && message.presence.x === 777)).toBe(false)
    await Promise.all([tv.close(), a.close(), lobby.close()])
  })

  it('an observer connects with a token bought without a seat, under the name it was bought with', async () => {
    const { id, code, hostKey } = await createRoom(run.http)
    const { token } = (await (await post(run.http, `/rooms/${code}/join`, { name: 'Eva' })).json()) as { token: string }
    const tv = await run.connectTable(id, hostKey)
    const eva = await WireClient.connect(run.base, id, null, { role: 'observer', name: 'Someone Else' }, { token })
    expect(eva.messages[0]?.t).toBe('snapshot')
    const roster = await tv.waitFor((m) => m.t === 'roster' && m.observers.length > 0)
    expect(roster.t === 'roster' ? roster.observers.map((o) => o.name) : null).toEqual(['Eva'])
    await Promise.all([tv.close(), eva.close()])
  })
})

describe('the host', () => {
  it('rotates the code: the old one stops resolving, the table screen learns the new one, guests do not', async () => {
    const { id, code, hostKey } = await createRoom(run.http)
    const tv = await run.connectTable(id, hostKey)
    expect(await tv.waitFor((m) => m.t === 'room')).toMatchObject({ t: 'room', code })
    const a = await run.connect(id, 'A')

    expect((await post(run.http, `/sessions/${id}/code`, {})).status).toBe(401)
    expect((await post(run.http, `/sessions/${id}/code`, {}, { authorization: 'Bearer nope' })).status).toBe(403)
    const rotated = await post(run.http, `/sessions/${id}/code`, {}, { authorization: `Bearer ${hostKey}` })
    expect(rotated.status).toBe(200)
    const next = (await rotated.json()) as { code: string; expiresAt: string }
    expect(next.code).toMatch(CODE)
    expect(next.code).not.toBe(code)
    expect((await fetch(`${run.http}/rooms/${code}`)).status).toBe(404)
    expect((await fetch(`${run.http}/rooms/${next.code}`)).status).toBe(200)
    const told = await tv.waitFor((m) => m.t === 'room' && m.code === next.code)
    expect(told.t === 'room' ? told.expiresAt : null).toBe(next.expiresAt)
    await new Promise((r) => setTimeout(r, 30))
    expect(a.messages.some((m) => m.t === 'room')).toBe(false)
    expect(a.frames.join('\n')).not.toContain(next.code)
    await Promise.all([tv.close(), a.close()])
  })

  it('kicks a guest: the connection is refused and closed, the seat is freed, the token is dead, and the seat can be taken again', async () => {
    const { id, code, hostKey } = await createRoom(run.http)
    const tv = await run.connectTable(id, hostKey)
    const token = await run.admit(id, 'A', 'Ada')
    const ada = await WireClient.connect(run.base, id, 'A', undefined, { token })
    expect((await ada.send('A', { v: 'seat.claim', seat: 'A', name: 'Ada' })).t).toBe('ack')
    await tv.synced(1)

    expect((await post(run.http, `/sessions/${id}/kick`, { seat: 'A' })).status).toBe(401)
    const kicked = await post(run.http, `/sessions/${id}/kick`, { seat: 'A' }, { authorization: `Bearer ${hostKey}` })
    expect(kicked.status).toBe(200)
    const refused = await ada.waitFor((m) => m.t === 'refused')
    expect(refused).toEqual({ t: 'refused', reason: 'kicked' })
    await ada.closed()
    await tv.synced(2)
    expect(tv.view?.seats.find((s) => s.id === 'A')?.name).toBeNull()

    const again = await WireClient.connect(run.base, id, 'A', undefined, { token })
    expect(again.messages[0]).toEqual({ t: 'refused', reason: 'a seat needs its token' })
    await again.close()
    expect((await post(run.http, `/rooms/${code}/join`, { name: 'Bo', seat: 'A' })).status).toBe(201)
    expect((await post(run.http, `/sessions/${id}/kick`, { seat: 'Q' }, { authorization: `Bearer ${hostKey}` })).status).toBe(404)
    await tv.close()
  })
})

describe('the owner', () => {
  it('may rotate and kick with the account cookie, for a table started from their project', async () => {
    await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
    const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
    const cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    const { zones, seats, floor } = twoSeatSetup()
    const doc = { name: 'Mitt spel', template, rows: [{ id: 'dragon', fields: { title: 'Drake' } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } }
    const made = await fetch(`${run.http}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(doc) })
    expect(made.status).toBe(201)
    const { id: projectId } = (await made.json()) as { id: string }
    const started = await fetch(`${run.http}/projects/${projectId}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json', cookie } })
    expect(started.status).toBe(201)
    const { id, code } = (await started.json()) as { id: string; code: string; hostKey: string }
    expect(code).toMatch(CODE)

    expect((await post(run.http, `/sessions/${id}/code`, {}, { cookie: 'byd_session=nope' })).status).toBe(401)
    const rotated = await post(run.http, `/sessions/${id}/code`, {}, { cookie })
    expect(rotated.status).toBe(200)
    expect(((await rotated.json()) as { code: string }).code).not.toBe(code)
    expect((await post(run.http, `/sessions/${id}/kick`, { seat: 'A' }, { cookie })).status).toBe(200)
  })
})

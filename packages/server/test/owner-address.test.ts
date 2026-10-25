import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { TABLE_PROTOCOL, tableProtocols } from '@byd/protocol'
import { WireClient } from './client.js'
import { start, twoSeatSetup, type Running } from './fixture.js'
import { template } from './deck.js'

// The host key and the owner's name in no address (#1306, DRIFT §9), as the guest's token since
// #1278. The table's screen hands its key over in `Sec-WebSocket-Protocol` and not in `?host=`, and
// the owner's own seat is told her name by the server, from her account, and not by its address.
let run: Running
let cookie = ''
beforeEach(async () => {
  run = await start()
  await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com' }) })
  const link = /\/auth\/verify\?token=\S+/.exec(run.mail.sent.at(-1)?.text ?? '')?.[0] ?? ''
  cookie = ((await fetch(`${run.http}${link}`, { redirect: 'manual' })).headers.get('set-cookie') ?? '').split(';')[0] ?? ''
})
afterEach(async () => {
  await run.stop()
})
const json = (method: string, path: string, body?: unknown) =>
  fetch(`${run.http}${path}`, { method, headers: { 'content-type': 'application/json', cookie }, body: body === undefined ? null : JSON.stringify(body) })

async function aTable(): Promise<{ sessionId: string; code: string; hostKey: string }> {
  const { zones, seats, floor } = twoSeatSetup()
  const created = await json('POST', '/projects', { name: 'Skogens herrar', template, rows: [{ id: 'dragon', fields: { title: 'Drake', antal: 2 } }], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
  const { id } = (await created.json()) as { id: string }
  const { id: sessionId, code, hostKey } = (await (await json('POST', `/projects/${id}/sessions`, {})).json()) as { id: string; code: string; hostKey: string }
  return { sessionId, code, hostKey }
}

// A socket opened as the browser's client opens one, with whatever it offers, until the table has
// either let it in (its snapshot) or turned it away.
async function knock(sessionId: string, query: string, protocols: string[] | undefined, headers: Record<string, string> = {}): Promise<{ messages: { t: string; name?: string; code?: string; reason?: string }[]; protocol: string }> {
  const ws = new WebSocket(`${run.base}/sessions/${sessionId}${query ? `?${query}` : ''}`, protocols, { headers })
  const messages: { t: string }[] = []
  ws.on('message', (data) => messages.push(JSON.parse(String(data)) as { t: string }))
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', reject)
  })
  await expect.poll(() => messages.some((m) => m.t === 'snapshot' || m.t === 'refused')).toBe(true)
  // The room message follows the snapshot for the table's own connections.
  await new Promise((resolve) => setTimeout(resolve, 50))
  const protocol = ws.protocol
  ws.close()
  return { messages, protocol }
}

describe('the table’s screen hands its key over in a header (#1306)', () => {
  it('lets the table’s own view in on the key in the protocol header, and tells it the room code', async () => {
    const { sessionId, code, hostKey } = await aTable()
    const { messages, protocol } = await knock(sessionId, '', tableProtocols({ host: hostKey }))
    expect(protocol, 'the server takes the protocol the client offered, or the browser hangs up').toBe(TABLE_PROTOCOL)
    expect(messages.find((m) => m.t === 'refused')).toBeUndefined()
    expect(messages.find((m) => m.t === 'room')).toMatchObject({ code })
  })

  it('refuses a key in the header that is not the table’s', async () => {
    const { sessionId } = await aTable()
    const { messages } = await knock(sessionId, '', tableProtocols({ host: 'not-the-key' }))
    expect(messages.find((m) => m.t === 'refused')).toMatchObject({ reason: 'the table needs the host key' })
  })

  // A screen that loaded the page before the box was updated reconnects the old way, with the key in
  // its address and no protocol. It still gets in.
  it('still lets in an old screen with the key in its address', async () => {
    const { sessionId, code, hostKey } = await aTable()
    const old = await WireClient.connect(run.base, sessionId, null, undefined, { host: hostKey })
    expect(old.messages.some((m) => m.t === 'refused')).toBe(false)
    expect(await old.waitFor((m) => m.t === 'room')).toMatchObject({ code })
    await old.close()
  })
})

describe('the owner’s own seat is told her name by the server (#1306)', () => {
  const asOwner = () => ({ cookie, origin: 'http://test.local' })
  const told = (messages: { t: string; name?: string }[]) => messages.find((m) => m.t === 'admitted')

  it('tells the owner’s seat the name she gave her account', async () => {
    const { sessionId } = await aTable()
    expect((await json('PUT', '/me/name', { name: 'Ada Lovelace' })).status).toBe(200)
    const { messages } = await knock(sessionId, 'seat=A&owner=1', tableProtocols(), asOwner())
    expect(messages.find((m) => m.t === 'refused')).toBeUndefined()
    expect(told(messages)).toEqual({ t: 'admitted', name: 'Ada Lovelace' })
    // Told before the snapshot, so the page has its name by the time it sees the seat it sits in.
    expect(messages.findIndex((m) => m.t === 'admitted')).toBeLessThan(messages.findIndex((m) => m.t === 'snapshot'))
  })

  it('tells an owner without a name nothing, and never her address', async () => {
    const { sessionId } = await aTable()
    const { messages } = await knock(sessionId, 'seat=A&owner=1', tableProtocols(), asOwner())
    expect(told(messages)).toBeUndefined()
    expect(JSON.stringify(messages)).not.toContain('ada@example.com')
  })

  // A seat that loaded the page before #1306 offers no protocol, and does not know the message.
  it('tells an old owner’s page nothing new', async () => {
    const { sessionId } = await aTable()
    expect((await json('PUT', '/me/name', { name: 'Ada Lovelace' })).status).toBe(200)
    const { messages } = await knock(sessionId, 'seat=A&owner=1', undefined, asOwner())
    expect(messages.find((m) => m.t === 'refused')).toBeUndefined()
    expect(told(messages)).toBeUndefined()
  })
})

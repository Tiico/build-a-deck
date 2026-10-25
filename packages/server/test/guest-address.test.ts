import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TABLE_PROTOCOL, guestProtocols } from '@byd/protocol'
import { TableHost, createServer, MemoryLogStore } from '../src/index.js'
import { createRoom, listenInBand, registry, start, type Running } from './fixture.js'
import { WireClient } from './client.js'

// A guest's name and token never travel in an address (#1278, DRIFT §9). The page's address keeps
// the token in its fragment, which the browser sends nowhere; what is left in the address is the
// table and the seat, and the page's `Referrer-Policy` keeps even that from following a request.
let stop: (() => Promise<void>) | null = null
afterEach(async () => {
  await stop?.()
  stop = null
})

describe('the page’s Referrer-Policy (#1278)', () => {
  it('sends only the origin as the referrer, never a path or a query', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'byd-referrer-'))
    await writeFile(join(dir, 'index.html'), '<!doctype html><html><head></head><body></body></html>')
    const store = new MemoryLogStore()
    const server = createServer({ host: new TableHost(registry, store), store, registry, staticDir: dir })
    const port = await listenInBand(server)
    stop = () => new Promise((resolve) => server.close(() => resolve()))
    for (const path of ['/play?session=s1&seat=A', '/observe?session=s1', '/claim?next=%2F', '/login', '/']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { accept: 'text/html' } })
      expect(res.status, path).toBe(200)
      expect(res.headers.get('referrer-policy'), path).toBe('strict-origin')
    }
  })
})

// The table's WebSocket is an address as well: the upgrade is a request, and a proxy that logs
// requests logs its query. So the client hands the token over in `Sec-WebSocket-Protocol`, the one
// header a browser lets a page set on a WebSocket, and the server tells the connection the name the
// token was bought with — the page no longer has one of its own to sit down with.
describe('the table’s door takes the token in a header (#1278)', () => {
  let run: Running
  afterEach(async () => {
    await run.stop()
  })

  // A socket opened as the browser's client opens one: the address names the table and the seat,
  // and the token rides in the offered protocols.
  async function knock(sessionId: string, query: Record<string, string>, token: string): Promise<{ frames: string[]; protocol: string; url: string }> {
    const url = `${run.base}/sessions/${sessionId}?${new URLSearchParams(query).toString()}`
    const ws = new WebSocket(url, guestProtocols(token))
    const frames: string[] = []
    ws.addEventListener('message', (ev) => frames.push(String(ev.data)))
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true })
      ws.addEventListener('error', () => reject(new Error('ws error')), { once: true })
    })
    await expect.poll(() => frames.some((f) => /"t":"(snapshot|refused)"/.test(f))).toBe(true)
    const protocol = ws.protocol
    ws.close()
    return { frames, protocol, url }
  }
  const told = (frames: string[]) => frames.map((f) => JSON.parse(f) as { t: string; name?: string }).find((m) => m.t === 'admitted')

  it('lets a seat in on a token in the protocol header, and tells it the name the token was bought with', async () => {
    run = await start()
    const { id } = await createRoom(run.http)
    const token = await run.admit(id, 'A', 'Ada Lovelace')
    const { frames, protocol, url } = await knock(id, { seat: 'A' }, token)
    expect(url).not.toContain(token)
    expect(protocol, 'the server takes the protocol the client offered, or the browser hangs up').toBe(TABLE_PROTOCOL)
    expect(frames.some((f) => f.includes('"t":"refused"')), frames.join('\n')).toBe(false)
    expect(told(frames)).toEqual({ t: 'admitted', name: 'Ada Lovelace' })
  })

  it('lets an observer in the same way, by the name on her admission and not one in the address', async () => {
    run = await start()
    const { id } = await createRoom(run.http)
    const token = await run.admit(id, null, 'Eva')
    const { frames } = await knock(id, { role: 'observer' }, token)
    expect(frames.some((f) => f.includes('"t":"refused"')), frames.join('\n')).toBe(false)
    expect(told(frames)).toEqual({ t: 'admitted', name: 'Eva' })
  })

  it('refuses a token in the header that was never bought', async () => {
    run = await start()
    const { id } = await createRoom(run.http)
    const { frames } = await knock(id, { seat: 'A' }, 'not-a-token')
    expect(frames.some((f) => f.includes('"t":"refused"'))).toBe(true)
  })

  // A phone that loaded the page before the box was updated reconnects the old way. It still gets
  // in, and is not sent a message its client does not know and would throw on.
  it('still lets in an old page with the token in its address, and tells it nothing new', async () => {
    run = await start()
    const { id } = await createRoom(run.http)
    const token = await run.admit(id, 'A', 'Ada')
    const old = await WireClient.connect(run.base, id, 'A', undefined, { token })
    expect(old.messages.some((m) => m.t === 'refused')).toBe(false)
    expect(old.frames.some((f) => f.includes('"admitted"'))).toBe(false)
    await old.close()
  })
})

// The way back after a login goes through the sign-in mail (G1, #690): `next` is where the link
// lands. A `next` with a fragment — the claim's, which holds the guest's token — keeps it as the
// link's own fragment, so the token is in the mail and never in the request the link makes; the
// browser carries a fragment through the redirect that follows (RFC 9110 §10.2.2).
describe('a sign-in link keeps next’s fragment out of its query (#1278)', () => {
  let run: Running
  afterEach(async () => {
    await run.stop()
  })

  it('puts the fragment after the link, and the redirect lands on next without it', async () => {
    run = await start()
    const path = `/claim?${new URLSearchParams({ next: '/play?session=s1&seat=A' }).toString()}`
    const res = await fetch(`${run.http}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'ada@example.com', next: `${path}#token=GUESTTOKEN` }) })
    expect(res.status).toBe(200)
    const text = run.mail.sent.at(-1)?.text ?? ''
    const link = new URL(/https?:\/\/\S+\/auth\/verify\?\S+/.exec(text)?.[0] ?? 'http://none.invalid')
    expect(link.hash).toBe('#token=GUESTTOKEN')
    expect(link.search).not.toContain('GUESTTOKEN')
    expect(link.searchParams.get('next')).toBe(path)
    const landed = await fetch(`${run.http}${link.pathname}${link.search}`, { redirect: 'manual' })
    expect(landed.status).toBe(302)
    const location = landed.headers.get('location') ?? ''
    expect(location).not.toContain('GUESTTOKEN')
    expect(location.endsWith(path)).toBe(true)
  })
})

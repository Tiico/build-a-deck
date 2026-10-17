import { connect, type Socket } from 'node:net'
import type { Server } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { TableHost, createServer, MemoryLogStore } from '../src/index.js'
import { listenInBand, registry } from './fixture.js'

// The connection the proxy in front of the box talks to the server over (#986, DRIFT §2).
//
// Traefik — or cloudflared, on a box without a proxy of its own — keeps an idle connection to the
// server in its pool and sends the next request on it. Node's own default hangs that connection up
// after five seconds, far inside the proxy's 90, and a request the proxy sends in the same moment
// goes out on a socket the server has just closed: a 502 the player sees, for nothing. The test
// fixtures were cured of the same race by never hanging up at all (#848, `fixture-connection`);
// production is cured by hanging up later than the proxy does, so that it is always the proxy
// that lets go first. These tests hold the server as `main.ts` makes it, not as a fixture does.

// What traefik's `serversTransport` and cloudflared's `originRequest` both keep an idle upstream
// connection for, by default. The box sets neither (DRIFT §2 has the proxy, and says so).
const PROXY_IDLE_MS = 90_000

function production(): Server {
  const store = new MemoryLogStore()
  return createServer({ host: new TableHost(registry, store), store, registry })
}

// A raw connection, so that what the server does with it is seen as it happens and not through a
// client pool that would quietly open a new one.
function open(port: number) {
  const socket: Socket = connect(port, '127.0.0.1')
  let heard = ''
  let hungUp = false
  socket.setEncoding('utf8')
  socket.on('data', (chunk: string) => (heard += chunk))
  socket.on('end', () => (hungUp = true))
  socket.on('close', () => (hungUp = true))
  return {
    socket,
    heard: () => heard,
    hungUp: () => hungUp,
    ask: async () => {
      heard = ''
      socket.write(`GET /health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: keep-alive\r\n\r\n`)
      // The whole answer: its body is sent in chunks, and the last chunk is the empty one.
      await vi.waitFor(() => expect(heard).toMatch(/"ok":true[\s\S]*\r\n0\r\n\r\n$/), { timeout: 4_000 })
    },
  }
}

describe('the connection the proxy pools to the server (#986)', () => {
  it('is kept by the server for longer than the proxy keeps it idle, and its headers waited for longer still', () => {
    const server = production()
    expect(server.keepAliveTimeout).toBeGreaterThan(PROXY_IDLE_MS)
    // Above the idle timer, so a request that arrives on a connection the instant before it would
    // have been closed is never cut off waiting for its headers; and inside the whole request's
    // own limit, which Node refuses to have the other way round.
    expect(server.headersTimeout).toBeGreaterThan(server.keepAliveTimeout)
    expect(server.headersTimeout).toBeLessThanOrEqual(server.requestTimeout)
  })

  // Six seconds of the test are the idle itself; the rest is two answers and a margin.
  it('is still there after an idle past Node’s own five seconds, and answers on it', { timeout: 15_000 }, async () => {
    const server = production()
    const port = await listenInBand(server)
    const proxy = open(port)
    try {
      await proxy.ask()
      // Past Node's five seconds, with a margin for its timer to have come round.
      await new Promise((resolve) => setTimeout(resolve, 6_000))
      expect(proxy.hungUp()).toBe(false)
      await proxy.ask()
      expect(proxy.heard()).toMatch(/^HTTP\/1\.1 200/)
    } finally {
      proxy.socket.destroy()
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  })

  // A drain closes the server (DRIFT §3). A connection that was idle then is hung up by Node at
  // once; one that was still answering a request would otherwise become idle a moment later and
  // sit out the whole keep-alive timer, now longer than the proxy's — and `close` waits for it.
  it('is hung up when the server closes, also when it was busy and only goes quiet afterwards', { timeout: 10_000 }, async () => {
    const server = production()
    const port = await listenInBand(server)
    const idle = open(port)
    const busy = open(port)
    try {
      await idle.ask()
      // A request the server is still reading when it closes: the headers are in, the body is not.
      const body = JSON.stringify({ version: 'v1' })
      busy.socket.write(`POST /sessions HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: keep-alive\r\n\r\n`)
      await new Promise((resolve) => setTimeout(resolve, 200))
      let closed = false
      server.close(() => (closed = true))
      await vi.waitFor(() => expect(idle.hungUp()).toBe(true), { timeout: 1_000 })
      expect(busy.hungUp()).toBe(false)
      busy.socket.write(body)
      // It gets its answer, whatever the answer is, and then the server lets go of it.
      await vi.waitFor(() => expect(busy.heard()).toMatch(/^HTTP\/1\.1 \d{3}/), { timeout: 2_000 })
      await vi.waitFor(() => expect(busy.hungUp()).toBe(true), { timeout: 2_000 })
      await vi.waitFor(() => expect(closed).toBe(true), { timeout: 2_000 })
    } finally {
      idle.socket.destroy()
      busy.socket.destroy()
      server.closeAllConnections()
    }
  })
})

import { connect, type Socket } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { start } from './fixture.js'

// The fixture's server never hangs up a connection on its own (#848), the same as the web
// suite's (`packages/web/test/fixtures.test.ts` has the whole story).
//
// Node closes a keep-alive connection that has been idle for five seconds, and `fetch` in this
// same process keeps that connection in its pool for the next request. A worker descheduled for
// longer than that wakes with the server's timer and its own next request due in the same turn,
// and the request goes out on a connection the server has just closed: «fetch failed». The client
// decides when its connection is done; the server's end is closed by `stop`, and only then.
describe('the connection a test talks to its server over (#848)', () => {
  // Six seconds of the test are the idle itself; the rest is two answers and a margin.
  it('is still there after an idle longer than a stalled worker sleeps, and answers on it', { timeout: 15_000 }, async () => {
    const run = await start()
    const port = Number(new URL(run.http).port)
    const socket: Socket = connect(port, '127.0.0.1')
    try {
      let heard = ''
      let hungUp = false
      socket.setEncoding('utf8')
      socket.on('data', (chunk: string) => (heard += chunk))
      socket.on('end', () => (hungUp = true))
      socket.on('close', () => (hungUp = true))
      const ask = async () => {
        heard = ''
        socket.write(`GET /health HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: keep-alive\r\n\r\n`)
        // The whole answer: its body is sent in chunks, and the last chunk is the empty one.
        await vi.waitFor(() => expect(heard).toMatch(/"ok":true[\s\S]*\r\n0\r\n\r\n$/), { timeout: 4_000 })
      }
      await ask()
      // Past Node's own five seconds, with a margin for its timer to have come round.
      await new Promise((resolve) => setTimeout(resolve, 6_000))
      expect(hungUp).toBe(false)
      await ask()
      expect(heard).toMatch(/^HTTP\/1\.1 200/)
    } finally {
      socket.destroy()
      await run.stop()
    }
  })
})

import { connect, createServer, type Socket } from 'node:net'

/** The stack reached over a line with a slow way down, the way a phone reaches the box. */
export type SlowLine = {
  /** The address to open pages at instead of the stack's own. */
  origin: string
  /** How long, from now on, each piece the server sends waits after the one before it. */
  delay: (ms: number) => void
  stop: () => Promise<void>
}

/**
 * A TCP relay in front of the stack, delaying what the server sends and nothing the client sends.
 *
 * Over the loopback a table's answer to one envelope lands in the page as one burst: the patch, the
 * activity, the ack and the door's refusal all arrive before the page has drawn the first of them,
 * and the page never acts on anything in between. On the box there is a network and a proxy in the
 * way, and the page draws each frame before the next one comes, while what it sends meanwhile
 * still reaches a server whose socket is closing (#1348).
 *
 * Playwright's own `routeWebSocket` cannot be this: it answers the server's closing handshake at
 * once, so nothing the page sends after it ever reaches the server. Delaying the bytes underneath
 * delays the closing handshake with them, exactly as a slow line does. HTTP goes through it too,
 * so a page opened at `origin` is one origin, as on the box.
 *
 * And a slow line is a line where the frames come apart. The server writes its answer to one
 * envelope in one go, so a delay on the bytes alone would hand the page the same burst later. Once
 * a connection is a WebSocket, what the server sends is cut at its frames, and each frame waits for
 * the delay on its own.
 */
export async function slowLine(target: string): Promise<SlowLine> {
  const { hostname, port } = new URL(target)
  let ms = 0
  const sockets = new Set<Socket>()
  const relay = createServer((client) => {
    const server = connect(Number(port), hostname)
    sockets.add(client).add(server)
    client.pipe(server)
    // In order, each piece `ms` after the one before it: a slow line, never a reordering one.
    let last = 0
    const later = (then: () => void) => {
      last = Math.max(Date.now(), last) + ms
      setTimeout(then, last - Date.now())
    }
    let socket = false
    let held = Buffer.alloc(0)
    server.on('data', (chunk: Buffer) => {
      if (!socket) {
        // An upgrade's answer is the head of a WebSocket; anything else is HTTP, passed on whole.
        if (!chunk.subarray(0, 12).toString('latin1').startsWith('HTTP/1.1 101')) return later(() => client.write(chunk))
        const end = chunk.indexOf('\r\n\r\n') + 4
        socket = true
        const head = chunk.subarray(0, end)
        later(() => client.write(head))
        chunk = chunk.subarray(end)
      }
      held = Buffer.concat([held, chunk])
      for (let size = frameSize(held); size !== null && held.length >= size; size = frameSize(held)) {
        const frame = held.subarray(0, size)
        held = held.subarray(size)
        later(() => client.write(frame))
      }
    })
    server.on('end', () => later(() => client.end()))
    const gone = () => {
      client.destroy()
      server.destroy()
      sockets.delete(client)
      sockets.delete(server)
    }
    client.on('error', gone).on('close', gone)
    server.on('error', gone).on('close', () => later(gone))
  })
  await new Promise<void>((resolve) => relay.listen(0, '127.0.0.1', resolve))
  const address = relay.address()
  if (address === null || typeof address === 'string') throw new Error('the relay has no port')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    delay: (next) => {
      ms = next
    },
    stop: () =>
      new Promise<void>((resolve) => {
        for (const s of sockets) s.destroy()
        relay.close(() => resolve())
      }),
  }
}

// How many bytes the WebSocket frame at the start of `bytes` takes, or null before its header has
// come. A server's frames are not masked (RFC 6455 §5.1).
function frameSize(bytes: Buffer): number | null {
  if (bytes.length < 2) return null
  const length = bytes[1]! & 0x7f
  if (length < 126) return 2 + length
  if (length === 126) return bytes.length < 4 ? null : 4 + bytes.readUInt16BE(2)
  return bytes.length < 10 ? null : 10 + Number(bytes.readBigUInt64BE(2))
}

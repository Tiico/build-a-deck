import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { ClientMessage, type ServerMessage } from '@byd/protocol'
import { validateSetup, type SetupDef, type TypeRegistry } from '@byd/engine'
import { Template } from '@byd/template'
import type { RenderStore } from '@byd/render/queue'
import type { TableHost } from './actor.js'
import type { Deck, LogStore } from './store.js'

export type ServerOptions = { host: TableHost; store: LogStore; registry: TypeRegistry; renders?: RenderStore }

const DeckBody = z.object({
  template: Template,
  rows: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  icons: z.record(z.string(), z.string()),
})

const CreateSession = z.object({
  id: z.string().min(1).optional(),
  version: z.string().min(1),
  setup: z.custom<SetupDef>((v) => typeof v === 'object' && v !== null),
  deck: DeckBody.optional(),
})

// HTTP for the few things that are not a table (health, creating a session), and one
// WebSocket per connection at `/sessions/:id?seat=A` — omit `seat` for a table view.
export function createServer(opts: ServerOptions): Server {
  const http = createHttpServer((req, res) => void route(opts, req, res))
  const wss = new WebSocketServer({ noServer: true })

  http.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const match = /^\/sessions\/([^/]+)$/.exec(url.pathname)
    if (!match) {
      socket.destroy()
      return
    }
    const sessionId = decodeURIComponent(match[1] ?? '')
    const seat = url.searchParams.get('seat')
    wss.handleUpgrade(req, socket, head, (ws) => void attach(opts, ws, sessionId, seat))
  })

  // `close` waits for every connection to end, and WebSockets never end on their own:
  // terminate them as part of closing, or a drain waits forever. Say goodbye first
  // (TableHost.drain) if clients should learn why.
  const close = http.close.bind(http)
  http.close = (callback?: (err?: Error) => void) => {
    for (const client of wss.clients) client.terminate()
    wss.close()
    return close(callback)
  }
  return http
}

async function route(opts: ServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      const loaded = await opts.host.loaded()
      return json(res, 200, { ok: true, tables: loaded.length })
    }
    if (req.method === 'POST' && url.pathname === '/sessions') {
      const body = CreateSession.parse(JSON.parse(await readBody(req)))
      validateSetup(body.setup, opts.registry)
      const id = body.id ?? randomUUID()
      const deck: Deck | undefined = body.deck
      await opts.store.createSession({ id, version: body.version, setup: body.setup, ...(deck ? { deck } : {}) })
      // Textures start rendering now rather than when the first screen connects.
      if (deck) await opts.host.get(id)
      return json(res, 201, { id })
    }
    const face = /^\/faces\/([0-9a-f]{64})$/.exec(url.pathname)
    if (req.method === 'GET' && face && opts.renders) {
      // The hash is the capability: only a seat that may see a face was ever told its hash.
      const hash = face[1] ?? ''
      const bytes = await opts.renders.output(hash)
      if (bytes) {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' })
        res.end(Buffer.from(bytes))
        return
      }
      const status = await opts.renders.status(hash)
      if (status && (status.state === 'queued' || status.state === 'running')) return json(res, 202, { state: status.state })
      if (status?.state === 'failed') return json(res, 500, { error: status.error ?? 'render failed' })
      return json(res, 404, { error: 'unknown face' })
    }
    json(res, 404, { error: 'not found' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
}

async function attach(opts: ServerOptions, ws: WebSocket, sessionId: string, seat: string | null): Promise<void> {
  const send = (message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
  const actor = await opts.host.get(sessionId)
  if (!actor) {
    send({ t: 'error', id: null, message: `unknown session ${sessionId}` })
    ws.close(4004, 'unknown session')
    return
  }
  const sub = { seat, send }
  actor.subscribe(sub)
  ws.on('close', () => actor.unsubscribe(sub))

  ws.on('message', (data) => {
    let id: string | null = null
    try {
      const raw: unknown = JSON.parse(data.toString())
      if (typeof raw === 'object' && raw !== null && 'envelope' in raw) {
        const env = (raw as { envelope?: { id?: unknown } }).envelope
        if (typeof env?.id === 'string') id = env.id
      }
      const msg = ClientMessage.parse(raw)
      // The connection's seat is authoritative; a client cannot speak for another seat.
      if (msg.envelope.seat !== seat) {
        send({ t: 'reject', id: msg.envelope.id, reason: 'envelope seat does not match connection seat' })
        return
      }
      void actor.submit(msg.envelope).then(
        (decision) => {
          if (decision.ok) send({ t: 'ack', id: msg.envelope.id, seqs: decision.applied.map((l) => l.seq) })
          else send({ t: 'reject', id: msg.envelope.id, reason: decision.reason })
        },
        (err: unknown) => send({ t: 'error', id: msg.envelope.id, message: err instanceof Error ? err.message : String(err) }),
      )
    } catch (err) {
      send({ t: 'error', id, message: err instanceof Error ? err.message : String(err) })
    }
  })
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

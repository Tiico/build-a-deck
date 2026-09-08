import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { ClientMessage, type ServerMessage } from '@byd/protocol'
import { CARD_STANDARD_63x88, validateSetup, type SetupDef, type TypeRegistry } from '@byd/engine'
import { Template, validateCard, type Issue } from '@byd/template'
import type { ObjectStore, RenderStore } from '@byd/render/queue'
import type { Subscriber, TableHost } from './actor.js'
import type { Deck, LogStore, SessionRecord } from './store.js'
import { ProjectDoc, deckFromProject, setupFromProject, type ProjectCredit, type ProjectRecord, type ProjectStore } from './projects.js'
import { diffProjects } from './diff.js'
import { SurveyAnswer, type SurveyStore } from './surveys.js'
import { COOKIE, LoginBody, LoginLimiter, SESSION_TTL_MS, TOKEN_TTL_MS, accountOf, hash, loginMail, safeNext, token, type Account, type AuthStore, type Mailer } from './auth.js'
import { CODE_TTL_MS, GUEST_PENDING_TTL_MS, codeExpiry, newCode, newSecret, normaliseCode } from './rooms.js'
import { facesOf, printExportOf } from './faces.js'
import { resolveAssets, resolveIcons, type AssetStore } from './assets.js'
import { TEXTURE_DPI } from './actor.js'

// `staticDir`: the built web app, served from the same origin as the API (README, DRIFT §1).
// `auth` and `mailer` turn on accounts (G1): projects then belong to whoever made them.
// `publicOrigin` is what login links point at; without it the request's origin is used.
export type ServerOptions = {
  host: TableHost
  store: LogStore
  registry: TypeRegistry
  renders?: RenderStore
  // The object store the outputs live in (DRIFT §4), asked by /health (§2).
  objects?: ObjectStore
  // The project's images (E1): uploaded by creators, served by hash.
  assets?: AssetStore
  projects?: ProjectStore
  surveys?: SurveyStore
  staticDir?: string
  auth?: AuthStore
  mailer?: Mailer
  publicOrigin?: string
  // Where the browser lands after the link (the web app); defaults to a path on this origin. In
  // development the web app is served from another port than the API.
  appOrigin?: string
  // Explicit local/test escape hatch: create the session on POST /auth/login instead of mailing.
  // Never infer this from missing mail configuration; production must opt in deliberately.
  authBypass?: boolean
  // One per server: how many login links an address may get per hour.
  limiter?: LoginLimiter
  // The clock, for tests: what codes and tokens expire against.
  now?: () => Date
}
const clock = (opts: ServerOptions): Date => (opts.now ?? (() => new Date()))()

// A fresh code and host key for a new session (DRIFT §9); the key is shown once and kept hashed.
function admission(opts: ServerOptions): { code: string; hostKey: string; record: { code: string; codeExpiresAt: string; hostKeyHash: string } } {
  const code = newCode()
  const hostKey = newSecret()
  return { code, hostKey, record: { code, codeExpiresAt: codeExpiry(clock(opts)), hostKeyHash: hash(hostKey) } }
}

const DeckBody = z.object({
  template: Template,
  rows: z.record(z.string(), z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  icons: z.record(z.string(), z.string()),
})

// Buying admission (DRIFT §9): a name, and a seat to sit at or none to watch.
const JoinBody = z.object({ name: z.string().trim().min(1).max(64), seat: z.string().min(1).optional() })
const KickBody = z.object({ seat: z.string().min(1) })
const ClaimBody = z.object({ token: z.string().min(1) })

// The tables an account sat at (G1), newest first, each with what came of it: the game's name,
// whether it ended, whether the survey was answered from that seat, how many moments were flagged
// from it, and the code to come back by while the table is open and the code lives.
export type Played = { session: string; seat: string | null; name: string; kind: 'seat' | 'observer'; at: string; game: string | null; version: string; ended: boolean; surveyed: boolean; flags: number; code?: string }
async function playedBy(opts: ServerOptions, accountId: string): Promise<Played[]> {
  const out: Played[] = []
  for (const g of await opts.store.guestsOf(accountId)) {
    const session = await opts.store.loadSession(g.sessionId)
    if (!session) continue
    const project = session.project && opts.projects ? await opts.projects.load(session.project) : null
    const log = await opts.store.read(g.sessionId)
    const ended = log.some((l) => l.intent.v === 'session.end')
    const flags = log.filter((l) => l.intent.v === 'flag' && (g.kind === 'seat' ? l.by === g.seat : l.intent.observer === g.name)).length
    const surveyed = opts.surveys ? (await opts.surveys.list(g.sessionId)).some((s) => (g.kind === 'seat' ? s.seat === g.seat : s.observer === true && s.who === g.name)) : false
    const codeLives = session.code !== undefined && session.codeExpiresAt !== undefined && Date.parse(session.codeExpiresAt) > clock(opts).getTime()
    out.push({ session: g.sessionId, seat: g.seat, name: g.name, kind: g.kind, at: g.issuedAt, game: project?.name ?? null, version: session.version, ended, surveyed, flags, ...(!ended && codeLives && session.code ? { code: session.code } : {}) })
  }
  return out
}

// Who may control a table (DRIFT §9): whoever holds the host key, or the account that owns the
// project it was started from. 'unknown' has shown nothing; 'wrong' has shown a key that is not it.
async function hostOf(opts: ServerOptions, req: IncomingMessage, session: SessionRecord): Promise<'host' | 'unknown' | 'wrong'> {
  const bearer = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? '')?.[1]
  if (bearer !== undefined) return session.hostKeyHash !== undefined && hash(bearer) === session.hostKeyHash ? 'host' : 'wrong'
  if (!opts.auth || !opts.projects || !session.project) return 'unknown'
  const account = await accountOf(opts.auth, req)
  if (!account) return 'unknown'
  const project = await opts.projects.load(session.project)
  return project?.owner === account.id ? 'host' : 'wrong'
}

const CreateSession = z.object({
  id: z.string().min(1).optional(),
  version: z.string().min(1),
  setup: z.custom<SetupDef>((v) => typeof v === 'object' && v !== null),
  deck: DeckBody.optional(),
})

// HTTP for the few things that are not a table (health, creating a session), and one
// WebSocket per connection at `/sessions/:id?seat=A` — omit `seat` for a table view.
export function createServer(given: ServerOptions): Server {
  const opts: ServerOptions = { ...given, limiter: given.limiter ?? new LoginLimiter() }
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
    const q = url.searchParams
    const ask: Admission = {
      seat: q.get('seat'),
      role: q.get('role') === 'observer' ? 'observer' : q.get('role') === 'lobby' ? 'lobby' : null,
      name: q.get('name'),
      token: q.get('token'),
      host: q.get('host'),
      owner: q.get('owner') === '1',
    }
    wss.handleUpgrade(req, socket, head, (ws) => void attach(opts, req, ws, sessionId, ask))
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

// Play is capability-based (room codes, face hashes); the creator's account rides in a cookie.
// Cookie-bearing requests are accepted only from this server or the configured development app.
const CORS_BASE: Record<string, string> = {
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
}

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

function browserOriginAllowed(opts: ServerOptions, req: IncomingMessage): boolean {
  const origin = originOf(req.headers.origin)
  if (!origin) return false
  const forwarded = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0]?.trim()
  const own = req.headers.host ? `${forwarded || (originOf(opts.publicOrigin)?.startsWith('https:') ? 'https' : 'http')}://${req.headers.host}` : null
  return [opts.publicOrigin, opts.appOrigin, own].some((candidate) => originOf(candidate ?? undefined) === origin)
}

function corsHeaders(opts: ServerOptions, req: IncomingMessage): Record<string, string> {
  const origin = req.headers.origin
  if (!origin) return { ...CORS_BASE, 'access-control-allow-origin': '*' }
  if (!browserOriginAllowed(opts, req)) return { ...CORS_BASE, vary: 'origin' }
  return { ...CORS_BASE, 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', vary: 'origin' }
}

async function route(opts: ServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  for (const [name, value] of Object.entries(corsHeaders(opts, req))) res.setHeader(name, value)
  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (opts.auth && url.pathname.startsWith('/auth/')) {
    await routeAuth(opts, opts.auth, req, res, url)
    return
  }
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      // Health means the store answers (DRIFT §2), not just that the process is up.
      const loaded = await opts.host.loaded()
      try {
        await opts.store.staleSessions(new Date(0))
      } catch (err) {
        return json(res, 503, { ok: false, tables: loaded.length, store: err instanceof Error ? err.message : String(err) })
      }
      if (opts.objects) {
        try {
          await opts.objects.check()
        } catch (err) {
          return json(res, 503, { ok: false, tables: loaded.length, store: 'ok', assets: err instanceof Error ? err.message : String(err) })
        }
      }
      return json(res, 200, { ok: true, tables: loaded.length, store: 'ok', ...(opts.objects ? { assets: 'ok' } : {}) })
    }
    if (req.method === 'POST' && url.pathname === '/sessions') {
      const body = CreateSession.parse(JSON.parse(await readBody(req)))
      validateSetup(body.setup, opts.registry)
      const id = body.id ?? randomUUID()
      const deck: Deck | undefined = body.deck
      const room = admission(opts)
      await opts.store.createSession({ id, version: body.version, setup: body.setup, ...(deck ? { deck } : {}), ...room.record })
      // Textures start rendering now rather than when the first screen connects.
      if (deck) await opts.host.get(id)
      return json(res, 201, { id, code: room.code, hostKey: room.hostKey })
    }
    // A code resolves to a session while it lives (DRIFT §9): what the join page asks first.
    const room = /^\/rooms\/([^/]+)$/.exec(url.pathname)
    if (req.method === 'GET' && room) {
      const code = normaliseCode(decodeURIComponent(room[1] ?? ''))
      const found = code ? await opts.store.sessionByCode(code) : null
      if (!found || Date.parse(found.codeExpiresAt) <= clock(opts).getTime()) return json(res, 404, { error: 'unknown or expired code' })
      return json(res, 200, { session: found.id })
    }
    // A code and a name buy a token (DRIFT §9): for a free seat, or for watching (C8).
    const join = /^\/rooms\/([^/]+)\/join$/.exec(url.pathname)
    if (req.method === 'POST' && join) {
      const code = normaliseCode(decodeURIComponent(join[1] ?? ''))
      const found = code ? await opts.store.sessionByCode(code) : null
      if (!found || Date.parse(found.codeExpiresAt) <= clock(opts).getTime()) return json(res, 404, { error: 'unknown or expired code' })
      const body = JoinBody.parse(JSON.parse(await readBody(req)))
      const actor = await opts.host.get(found.id)
      if (!actor) return json(res, 404, { error: 'unknown session' })
      if (body.seat !== undefined) {
        const seat = actor.seats().find((s) => s.id === body.seat)
        if (!seat) return json(res, 404, { error: `unknown seat ${body.seat}` })
        if (seat.name !== null) return json(res, 409, { error: `seat ${body.seat} is taken` })
      }
      const guestToken = newSecret()
      const issuedAt = clock(opts)
      const issued = await opts.store.issueGuest(found.id, {
        tokenHash: hash(guestToken),
        kind: body.seat !== undefined ? 'seat' : 'observer',
        seat: body.seat ?? null,
        name: body.name,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + GUEST_PENDING_TTL_MS).toISOString(),
      })
      if (!issued) return json(res, 409, { error: `seat ${body.seat} is reserved` })
      return json(res, 201, { session: found.id, token: guestToken })
    }
    // Claiming a guest session to an account afterwards (G1): the admission the phone played under
    // becomes the account's, and with it the seat, the name, the flags and the survey.
    if (req.method === 'POST' && url.pathname === '/guests/claim') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      const { token: guestToken } = ClaimBody.parse(JSON.parse(await readBody(req)))
      const claimed = await opts.store.claimGuest(hash(guestToken), account.id)
      if (claimed === null) return json(res, 404, { error: 'unknown token' })
      if (claimed === 'other') return json(res, 409, { error: 'another account has this session' })
      return json(res, 200, { session: claimed.sessionId, seat: claimed.seat, name: claimed.name })
    }
    if (req.method === 'GET' && url.pathname === '/me/played') {
      if (!opts.auth) return json(res, 404, { error: 'accounts are off' })
      const account = await accountOf(opts.auth, req)
      if (!account) return json(res, 401, { error: 'log in first' })
      return json(res, 200, await playedBy(opts, account.id))
    }
    // The host's controls (DRIFT §9): a new code, and a kick. With the host key, or the owner's cookie.
    const control = /^\/sessions\/([^/]+)\/(code|kick)$/.exec(url.pathname)
    if (req.method === 'POST' && control) {
      const sessionId = decodeURIComponent(control[1] ?? '')
      const session = await opts.store.loadSession(sessionId)
      if (!session) return json(res, 404, { error: 'unknown session' })
      const who = await hostOf(opts, req, session)
      if (who !== 'host') return json(res, who === 'wrong' ? 403 : 401, { error: who === 'wrong' ? 'wrong host key' : 'the host key or the owner\'s login is needed' })
      const actor = await opts.host.get(sessionId)
      if (control[2] === 'code') {
        const expiresAt = codeExpiry(clock(opts))
        let code = newCode()
        for (let tries = 0; (await opts.store.sessionByCode(code)) !== null && tries < 5; tries++) code = newCode()
        await opts.store.setCode(sessionId, code, expiresAt)
        actor?.tellTable({ t: 'room', code, expiresAt })
        return json(res, 200, { code, expiresAt })
      }
      const { seat } = KickBody.parse(JSON.parse(await readBody(req)))
      if (!session.setup.seats.includes(seat)) return json(res, 404, { error: `unknown seat ${seat}` })
      const revoked = await opts.store.revokeGuests(sessionId, seat, clock(opts).toISOString())
      await actor?.kick(seat)
      return json(res, 200, { ok: true, revoked })
    }
    if (opts.assets) {
      const handled = await routeAssets(opts, opts.assets, req, res, url)
      if (handled) return
    }
    if (opts.projects) {
      const handled = await routeProjects(opts, opts.projects, req, res, url)
      if (handled) return
    }
    const face = /^\/faces\/([0-9a-f]{64})$/.exec(url.pathname)
    if (req.method === 'GET' && face && opts.renders) {
      // The hash is the capability: only a seat that may see a face was ever told its hash.
      const hash = face[1] ?? ''
      // In R2 (DRIFT §4): a short-lived link the browser follows and keeps for most of its
      // life, so a texture is one round trip to the house and then none.
      const link = await opts.renders.link(hash, FACE_LINK_TTL_S)
      if (link) {
        res.writeHead(302, { location: link, 'cache-control': `private, max-age=${FACE_LINK_TTL_S - FACE_LINK_SLACK_S}` })
        res.end()
        return
      }
      const bytes = await opts.renders.output(hash)
      if (bytes) {
        res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' })
        res.end(Buffer.from(bytes))
        return
      }
      const status = await opts.renders.status(hash)
      if (status && (status.state === 'queued' || status.state === 'running')) return json(res, 202, { state: status.state })
      if (status?.state === 'failed') {
        // "Försök igen" on the card (#10). A dead job cannot be revived by fetching it again,
        // so the ask reaches the queue: the same page is rendered once more. The hash is the
        // capability, and asking twice costs one render, not two — a queued job is left alone.
        if (url.searchParams.get('retry') === '1' && (await opts.renders.requeue(hash))) return json(res, 202, { state: 'queued' })
        return json(res, 500, { error: status.error ?? 'render failed' })
      }
      return json(res, 404, { error: 'unknown face' })
    }
    if (opts.staticDir && (req.method === 'GET' || req.method === 'HEAD')) {
      if (await serveStatic(opts.staticDir, url.pathname, res)) return
    }
    json(res, 404, { error: 'not found' })
  } catch (err) {
    json(res, 400, { error: err instanceof Error ? err.message : String(err) })
  }
}

// A face link lives an hour; the browser may reuse it for all but the last ten minutes, so a
// cached link is never one that has just expired.
const FACE_LINK_TTL_S = 3600
const FACE_LINK_SLACK_S = 600

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

// The built web app: hashed assets forever, everything else briefly, and the app's own routes
// (/table, /play, …) fall back to index.html so the client can pick the page. Never a byte
// outside the directory.
const API_PREFIXES = ['/sessions', '/projects', '/faces', '/health', '/rooms', '/guests', '/me']
async function serveStatic(dir: string, pathname: string, res: ServerResponse): Promise<boolean> {
  // The API never falls back to the app, whatever is or is not mounted.
  if (API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false
  const root = resolve(dir)
  const wanted = resolve(root, '.' + normalize(decodeURIComponent(pathname)))
  if (wanted !== root && !wanted.startsWith(root + sep)) return false
  const candidate = await fileAt(wanted)
  const file = candidate ?? (extname(wanted) === '' ? await fileAt(join(root, 'index.html')) : null)
  if (!file) return false
  const type = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream'
  const hashed = file.includes(`${sep}assets${sep}`)
  res.writeHead(200, { 'content-type': type, 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' })
  await new Promise<void>((resolve, reject) => createReadStream(file).on('error', reject).on('end', () => resolve()).pipe(res))
  return true
}

async function fileAt(path: string): Promise<string | null> {
  try {
    const s = await stat(path)
    return s.isFile() ? path : null
  } catch {
    return null
  }
}

// What a connection asks to be (DRIFT §9), from its query string.
type Admission = { seat: string | null; role: 'observer' | 'lobby' | null; name: string | null; token: string | null; host: string | null; owner: boolean }
// Who it is allowed to be: the table (with the host key), a seat or an observer (with a token
// bought for that), or a lobby that only looks. Anything else is refused.
type Admitted = { seat: string | null; observer?: string; lobby?: true }
async function admit(opts: ServerOptions, req: IncomingMessage, session: SessionRecord, ask: Admission): Promise<Admitted | { refused: string }> {
  if (ask.role === 'lobby') return { seat: null, lobby: true }
  // An editor marks its project-owner connection explicitly. Accounts verify the cookie; when
  // accounts are disabled, projects are intentionally open and the same development flow works.
  if (ask.owner) {
    if (!session.project || (opts.auth && (!browserOriginAllowed(opts, req) || (await hostOf(opts, req, session)) !== 'host'))) return { refused: 'the table needs the host key or its owner' }
    if (ask.seat !== null && !session.setup.seats.includes(ask.seat)) return { refused: `unknown seat ${ask.seat}` }
    if (ask.role === 'observer') {
      const name = ask.name?.trim()
      return name && name.length <= 64 ? { seat: null, observer: name } : { refused: 'an observer needs a name of at most 64 characters' }
    }
    return { seat: ask.seat }
  }
  if (ask.host !== null) return session.hostKeyHash && hash(ask.host) === session.hostKeyHash ? { seat: null } : { refused: 'the table needs the host key' }
  const now = clock(opts)
  const live = ask.token !== null
    ? await opts.store.activateGuest(session.id, hash(ask.token), now.toISOString(), new Date(now.getTime() + CODE_TTL_MS).toISOString())
    : null
  if (ask.role === 'observer') return live?.kind === 'observer' ? { seat: null, observer: live.name } : { refused: 'an observer needs a token' }
  if (ask.seat !== null) return live?.kind === 'seat' && live.seat === ask.seat ? { seat: ask.seat } : { refused: 'a seat needs its token' }
  return { refused: 'the table needs the host key' }
}

async function attach(opts: ServerOptions, req: IncomingMessage, ws: WebSocket, sessionId: string, ask: Admission): Promise<void> {
  const send = (message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
  const session = await opts.store.loadSession(sessionId)
  const actor = session ? await opts.host.get(sessionId) : null
  if (!session || !actor) {
    send({ t: 'error', id: null, message: `unknown session ${sessionId}` })
    ws.close(4004, 'unknown session')
    return
  }
  const who = await admit(opts, req, session, ask)
  if ('refused' in who) {
    send({ t: 'refused', reason: who.refused })
    ws.close(4003, who.refused)
    return
  }
  const seat = who.seat
  const sub: Subscriber = { seat, id: randomUUID(), send, close: () => ws.close(4003, 'kicked'), ...(who.observer !== undefined ? { observer: who.observer } : {}), ...(who.lobby ? { lobby: true } : {}) }
  actor.subscribe(sub)
  // A connection keeps the code alive for another few hours (DRIFT §9); the host's screen is
  // told the code, since it is what the room is joined by.
  if (session.code) {
    const expiresAt = codeExpiry(clock(opts))
    await opts.store.setCode(sessionId, session.code, expiresAt)
    if (seat === null && who.observer === undefined && !who.lobby) send({ t: 'room', code: session.code, expiresAt })
  }
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
      // A lobby looks at the seats and does nothing — including no ephemeral presence.
      if (sub.lobby) {
        if (msg.t === 'envelope') send({ t: 'reject', id: msg.envelope.id, reason: 'a lobby may only look' })
        return
      }
      if (msg.t === 'presence') {
        actor.relay(sub, msg.presence)
        return
      }
      // The connection's seat is authoritative; a client cannot speak for another seat.
      if (msg.envelope.seat !== seat) {
        send({ t: 'reject', id: msg.envelope.id, reason: 'envelope seat does not match connection seat' })
        return
      }
      // An observer may only flag (C8), and a flag says who flagged it: only the server stamps that.
      if (sub.observer !== undefined && msg.envelope.intents.some((it) => it.v !== 'flag')) {
        send({ t: 'reject', id: msg.envelope.id, reason: 'an observer can only flag' })
        return
      }
      const envelope = {
        ...msg.envelope,
        intents: msg.envelope.intents.map((it) => {
          if (it.v !== 'flag') return it
          const flag = { v: 'flag' as const, ...(it.note !== undefined ? { note: it.note } : {}) }
          return sub.observer !== undefined ? { ...flag, observer: sub.observer } : flag
        }),
      }
      void actor.submit(envelope).then(
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

// Projects (L4, L5): a revisioned document, and "start a table" which expands the rows into a
// session with its deck so textures start rendering at once.
// The deck a table or a print is made from: the project's rows with their images inlined (E1),
// so the compiled page is complete and the render worker needs nothing but the page.
async function deckOf(opts: ServerOptions, rec: ProjectRecord): Promise<Deck> {
  if (!opts.assets) return deckFromProject(rec)
  return deckFromProject({ ...rec, rows: await resolveAssets(rec.rows, opts.assets), icons: await resolveIcons(rec.icons, opts.assets) })
}

// Every card of the project through the physical checks (E5), once per face, named by the card
// the reader would hold. The row is what the card actually says, so a check reads the same thing
// the compiler does.
function checkedCards(rec: ProjectRecord, registry: TypeRegistry): (Issue & { cardRef: string; face: string })[] {
  const type = registry.get({ id: CARD_STANDARD_63x88.id, version: CARD_STANDARD_63x88.version })
  const out: (Issue & { cardRef: string; face: string })[] = []
  for (const row of rec.rows) {
    for (const [face, template] of Object.entries(rec.template.faces)) {
      for (const issue of validateCard({ type, face: template, row: row.fields })) out.push({ ...issue, cardRef: row.id, face })
    }
  }
  return out
}

// The project's credits as a list, in the icon set's order: what a print order carries (E4).
function creditsOf(rec: ProjectRecord): (ProjectCredit & { name: string })[] {
  return Object.entries(rec.credits ?? {}).map(([name, c]) => ({ name, ...c }))
}

const ASSET_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
const ASSET_MAX_BYTES = 8 * 1024 * 1024
const ASSET_LINK_TTL_S = 3600

// Images (E1, DRIFT §4): POST /assets takes one from a logged-in creator and answers with its
// hash; GET /assets/:hash serves it to whoever knows the hash, from R2 when there is one.
async function routeAssets(opts: ServerOptions, assets: AssetStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  if (req.method === 'POST' && url.pathname === '/assets') {
    const account = opts.auth ? await accountOf(opts.auth, req) : null
    if (opts.auth && !account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const contentType = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? ''
    if (!ASSET_TYPES.has(contentType)) {
      json(res, 415, { error: 'not an image' })
      return true
    }
    const bytes = await readBytes(req, ASSET_MAX_BYTES)
    if (!bytes) {
      json(res, 413, { error: 'too big' })
      return true
    }
    const hash = await assets.put(bytes, contentType)
    json(res, 201, { hash })
    return true
  }
  const one = /^\/assets\/([0-9a-f]{64})$/.exec(url.pathname)
  if (one && req.method === 'GET') {
    const hash = one[1] ?? ''
    const link = await assets.link(hash, ASSET_LINK_TTL_S)
    if (link) {
      res.writeHead(302, { location: link, 'cache-control': `private, max-age=${ASSET_LINK_TTL_S - FACE_LINK_SLACK_S}` })
      res.end()
      return true
    }
    const got = await assets.get(hash)
    if (!got) {
      json(res, 404, { error: 'unknown asset' })
      return true
    }
    res.writeHead(200, { 'content-type': got.contentType, 'cache-control': 'public, max-age=31536000, immutable' })
    res.end(Buffer.from(got.bytes))
    return true
  }
  return false
}

async function routeProjects(opts: ServerOptions, projects: ProjectStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  // Who is asking (G1): with accounts on, creating needs one, and an owned project answers only
  // its owner. A project without an owner is from before accounts and stays open.
  const account = opts.auth ? await accountOf(opts.auth, req) : null
  const owned = async (id: string): Promise<{ rec: ProjectRecord } | { status: number; error: string }> => {
    const rec = await projects.load(id)
    if (!rec) return { status: 404, error: 'unknown project' }
    if (rec.owner === undefined) return { rec }
    if (!account) return { status: 401, error: 'log in first' }
    if (rec.owner !== account.id) return { status: 403, error: 'not your project' }
    return { rec }
  }
  if (req.method === 'GET' && url.pathname === '/projects') {
    if (!account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    json(res, 200, await projects.list(account.id))
    return true
  }
  if (req.method === 'POST' && url.pathname === '/projects') {
    if (opts.auth && !account) {
      json(res, 401, { error: 'log in first' })
      return true
    }
    const body = z.object({ id: z.string().min(1).optional() }).and(ProjectDoc).parse(JSON.parse(await readBody(req)))
    const { id: wanted, ...doc } = body
    validateSetup(setupFromProject(doc), opts.registry)
    const rec = await projects.create(wanted ?? randomUUID(), doc, account?.id)
    json(res, 201, { id: rec.id, rev: rec.rev })
    return true
  }
  const one = /^\/projects\/([^/]+)$/.exec(url.pathname)
  if (one && req.method === 'GET') {
    const got = await owned(decodeURIComponent(one[1] ?? ''))
    if ('rec' in got) json(res, 200, got.rec)
    else json(res, got.status, { error: got.error })
    return true
  }
  if (one && req.method === 'PUT') {
    const gate = await owned(decodeURIComponent(one[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const body = z.object({ rev: z.number().int() }).and(ProjectDoc).parse(JSON.parse(await readBody(req)))
    const { rev, ...doc } = body
    validateSetup(setupFromProject(doc), opts.registry)
    const result = await projects.replace(decodeURIComponent(one[1] ?? ''), rev, doc)
    if (result === 'missing') json(res, 404, { error: 'unknown project' })
    else if (result === 'conflict') json(res, 409, { error: 'project changed since rev ' + rev })
    else json(res, 200, { id: result.id, rev: result.rev })
    return true
  }
  // The history (B4): every save is a version, none of them is ever rewritten. It is presented
  // as versions with a date and, for the ones that meant something, a name — never as commits.
  const versions = /^\/projects\/([^/]+)\/versions$/.exec(url.pathname)
  if (versions && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(versions[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    json(res, 200, await projects.versions(gate.rec.id))
    return true
  }
  const oneVersion = /^\/projects\/([^/]+)\/versions\/(\d+)$/.exec(url.pathname)
  if (oneVersion && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(oneVersion[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const rec = await projects.at(gate.rec.id, Number(oneVersion[2]))
    if (!rec) json(res, 404, { error: 'unknown version' })
    else json(res, 200, rec)
    return true
  }
  const naming = /^\/projects\/([^/]+)\/versions\/(\d+)\/label$/.exec(url.pathname)
  if (naming && req.method === 'PUT') {
    const gate = await owned(decodeURIComponent(naming[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const body = z.object({ label: z.string().min(1).max(80).nullable() }).parse(JSON.parse(await readBody(req)))
    const named = await projects.label(gate.rec.id, Number(naming[2]), body.label)
    if (named === 'missing') json(res, 404, { error: 'unknown version' })
    else json(res, 200, named)
    return true
  }
  // What changed between two versions, as changes in the card table. Without `from`, against
  // the version just before this one.
  const diffing = /^\/projects\/([^/]+)\/versions\/(\d+)\/diff$/.exec(url.pathname)
  if (diffing && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(diffing[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const to = Number(diffing[2])
    const asked = url.searchParams.get('from')
    const before = await projects.at(gate.rec.id, asked === null ? to - 1 : Number(asked))
    const after = await projects.at(gate.rec.id, to)
    if (!after) json(res, 404, { error: 'unknown version' })
    else if (!before) json(res, 200, { rows: after.rows.map((r) => ({ kind: 'added', cardRef: r.id })), reordered: false, template: true, setup: true, icons: true })
    else json(res, 200, diffProjects(before, after))
    return true
  }
  // The project's current revision as print work (#14): one manifest entry per physical card,
  // with every face compiled from that same row. The response is safe metadata only; compiled
  // HTML/CSS stays inside the render queue, where the existing Chromium worker consumes it.
  const print = /^\/projects\/([^/]+)\/print$/.exec(url.pathname)
  if (print && req.method === 'POST') {
    const gate = await owned(decodeURIComponent(print[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    if (!opts.renders) {
      json(res, 503, { error: 'render queue unavailable' })
      return true
    }
    const rec = gate.rec
    // Physical validation (E5): warnings live in the editor, errors stop an order. A card that
    // would come back unreadable is cheaper to catch here than in five hundred printed copies.
    const found = checkedCards(rec, opts.registry)
    const errors = found.filter((f) => f.severity === 'error')
    if (errors.length > 0) {
      json(res, 422, { project: rec.id, rev: rec.rev, errors })
      return true
    }
    const printed = printExportOf(await deckOf(opts, rec), setupFromProject(rec), opts.registry, clock(opts).getTime())
    for (const job of printed.jobs) await opts.renders.enqueue(job)
    // The licences of every symbol the game uses go with the order (E4): the printer is handed
    // what the deck is made of, not only how it looks.
    json(res, 202, { project: rec.id, rev: rec.rev, cards: printed.cards, credits: creditsOf(rec), warnings: found })
    return true
  }
  const start = /^\/projects\/([^/]+)\/sessions$/.exec(url.pathname)
  // The tables this game has (#19): the editor's Bord tab reads them here. The version and
  // whether the log is locked come from the actor, the same source `GET /sessions/:id` answers
  // from, so a refreshed table says the rev it actually runs.
  if (start && req.method === 'GET') {
    const gate = await owned(decodeURIComponent(start[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const summaries = await opts.store.sessionsOf(gate.rec.id)
    const tables: { id: string; version: string; ended: boolean; lastAt: string | null }[] = []
    for (const summary of summaries) {
      const actor = await opts.host.get(summary.id)
      if (actor) tables.push({ id: summary.id, version: actor.version, ended: actor.ended, lastAt: summary.lastAt })
    }
    json(res, 200, tables)
    return true
  }
  if (start && req.method === 'POST') {
    const gate = await owned(decodeURIComponent(start[1] ?? ''))
    if (!('rec' in gate)) {
      json(res, gate.status, { error: gate.error })
      return true
    }
    const rec = gate.rec
    const id = randomUUID()
    const room = admission(opts)
    await opts.store.createSession({ id, version: `rev-${rec.rev}`, setup: setupFromProject(rec), deck: await deckOf(opts, rec), project: rec.id, ...room.record })
    await opts.host.get(id)
    json(res, 201, { id, version: `rev-${rec.rev}`, code: room.code, hostKey: room.hostKey })
    return true
  }
  // The whole log for the replay corpus (DRIFT §7): version, setup and every line with its
  // outcome. Never the deck: textures are not the point, and the corpus is anonymised after.
  const exportOne = /^\/sessions\/([^/]+)\/export$/.exec(url.pathname)
  if (exportOne && req.method === 'GET') {
    const sessionId = decodeURIComponent(exportOne[1] ?? '')
    const session = await opts.store.loadSession(sessionId)
    if (!session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    json(res, 200, { id: sessionId, version: session.version, setup: session.setup, log: await opts.store.read(sessionId) })
    return true
  }
    // A session as a record (C9): which version runs, whether the log is locked.
  const sessionOne = /^\/sessions\/([^/]+)$/.exec(url.pathname)
  if (sessionOne && req.method === 'GET') {
    const sessionId = decodeURIComponent(sessionOne[1] ?? '')
    const actor = await opts.host.get(sessionId)
    const session = await opts.store.loadSession(sessionId)
    if (!actor || !session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    // The game's name comes from the project the table was started from (L5): a screen shows it
    // as its title, and there is no second place a name could live.
    const named = session.project ? await projects.load(session.project) : null
    json(res, 200, { id: sessionId, version: actor.version, ended: actor.ended, ...(session.project ? { project: session.project } : {}), ...(named ? { name: named.name } : {}) })
    return true
  }
    // The survey after a session (G3): one structured answer per participant, once the log is
  // locked, tied to the version it ended on.
  const survey = /^\/sessions\/([^/]+)\/survey$/.exec(url.pathname)
  if (survey && req.method === 'POST' && opts.surveys) {
    const sessionId = decodeURIComponent(survey[1] ?? '')
    const actor = await opts.host.get(sessionId)
    const session = await opts.store.loadSession(sessionId)
    if (!actor || !session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    if (!actor.ended) {
      json(res, 409, { error: 'the session has not ended' })
      return true
    }
    const answer = SurveyAnswer.parse(JSON.parse(await readBody(req)))
    await opts.surveys.add({ sessionId, version: actor.version, at: new Date().toISOString(), ...answer })
    json(res, 201, { ok: true })
    return true
  }
  const surveys = /^\/sessions\/([^/]+)\/surveys$/.exec(url.pathname)
  if (surveys && req.method === 'GET' && opts.surveys) {
    json(res, 200, await opts.surveys.list(decodeURIComponent(surveys[1] ?? '')))
    return true
  }
  // How far the textures of a table have come (L5): the editor shows a table only once its
  // cards can be seen.
  const textures = /^\/sessions\/([^/]+)\/textures$/.exec(url.pathname)
  if (textures && req.method === 'GET') {
    const actor = await opts.host.get(decodeURIComponent(textures[1] ?? ''))
    if (!actor) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    json(res, 200, await progress(opts, actor.textureHashes()))
    return true
  }
  // Before "Uppdatera bordet" (L5): queue the textures of the project's current rev without
  // touching the table, and say how far they have come. The editor refreshes once all are done,
  // so the switch is atomic for the players.
  const prepare = /^\/sessions\/([^/]+)\/prepare$/.exec(url.pathname)
  if (prepare && req.method === 'POST') {
    const session = await opts.store.loadSession(decodeURIComponent(prepare[1] ?? ''))
    const rec = session?.project ? await projects.load(session.project) : null
    if (!session || !rec) {
      json(res, 404, { error: session ? 'unknown project' : 'unknown session' })
      return true
    }
    const compiled = facesOf(await deckOf(opts, rec), setupFromProject(rec), opts.registry, TEXTURE_DPI, Date.now())
    // A job that failed for good stays failed here (#10): enqueueing it again would put it back
    // in the queue and the editor would poll a dead render forever, never learning it was dead.
    // `?retry=1` is the one place that says "try it anyway", and it comes from a person asking.
    const retryFailed = url.searchParams.get('retry') === '1'
    if (opts.renders) {
      for (const job of compiled.jobs) {
        if (!retryFailed && (await opts.renders.status(job.hash))?.state === 'failed') continue
        await opts.renders.enqueue(job)
      }
    }
    json(res, 200, await progress(opts, compiled.jobs.map((j) => j.hash)))
    return true
  }
  // "Uppdatera bordet" on a running table (C7, L5): the project's current rev becomes a
  // version.change line, and the actor gets the new textures.
  const refresh = /^\/sessions\/([^/]+)\/refresh$/.exec(url.pathname)
  if (refresh && req.method === 'POST') {
    const sessionId = decodeURIComponent(refresh[1] ?? '')
    const session = await opts.store.loadSession(sessionId)
    if (!session) {
      json(res, 404, { error: 'unknown session' })
      return true
    }
    if (!session.project) {
      json(res, 409, { error: 'session was not started from a project' })
      return true
    }
    const rec = await projects.load(session.project)
    const actor = rec ? await opts.host.get(sessionId) : null
    if (!rec || !actor) {
      json(res, 404, { error: 'unknown project' })
      return true
    }
    const setup = setupFromProject(rec)
    await actor.refreshDeck(await deckOf(opts, rec), setup)
    const version = `rev-${rec.rev}`
    const decision = await actor.submit({ id: randomUUID(), seat: null, intents: [{ v: 'version.change', to: version, components: setup.components }] })
    if (!decision.ok) json(res, 409, { error: decision.reason })
    else json(res, 200, { version, seqs: decision.applied.map((l) => l.seq) })
    return true
  }
  return false
}

async function progress(opts: ServerOptions, hashes: readonly string[]): Promise<{ total: number; done: number; failed: string[] }> {
  let done = 0
  const failed: string[] = []
  for (const hash of hashes) {
    const status = opts.renders ? await opts.renders.status(hash) : null
    if (status?.state === 'done') done++
    else if (status?.state === 'failed') failed.push(hash)
  }
  return { total: hashes.length, done, failed }
}

// Magic links (G1, DRIFT §11). POST /auth/login mails a link and always answers 200 — never a
// word about whether the address is known. GET /auth/verify redeems it once, sets the session
// cookie and sends the browser on. GET /auth/me says who you are; POST /auth/logout forgets.
async function routeAuth(opts: ServerOptions, auth: AuthStore, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const now = () => new Date()
  if (req.method === 'POST' && url.pathname === '/auth/login') {
    const parsed = LoginBody.safeParse(JSON.parse(await readBody(req)))
    if (!parsed.success) return json(res, 400, { error: 'that is not an address' })
    const email = parsed.data.email.trim().toLowerCase()
    if (opts.limiter && !opts.limiter.allow(email, Date.now())) return json(res, 429, { error: 'too many links; try again later' })
    if (opts.authBypass) {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': await createLoginSession(opts, auth, email),
      })
      res.end(JSON.stringify({ ok: true, loggedIn: true }))
      return
    }
    const t = token()
    await auth.issueToken(hash(t), email, new Date(Date.now() + TOKEN_TTL_MS).toISOString())
    // The link must come back to this API, where the cookie lives: never the page's origin.
    const base = opts.publicOrigin ?? `http://${req.headers.host ?? 'localhost'}`
    const link = `${base}/auth/verify?token=${t}&next=${encodeURIComponent(safeNext(parsed.data.next))}`
    await opts.mailer?.send(loginMail(email, link))
    return json(res, 200, { ok: true })
  }
  if (req.method === 'GET' && url.pathname === '/auth/verify') {
    const t = url.searchParams.get('token') ?? ''
    const email = t ? await auth.redeemToken(hash(t), now().toISOString()) : null
    if (!email) return json(res, 400, { error: 'the link is spent or too old; ask for a new one' })
    res.writeHead(302, {
      'set-cookie': await createLoginSession(opts, auth, email),
      location: `${opts.appOrigin ?? ''}${safeNext(url.searchParams.get('next') ?? undefined)}`,
    })
    res.end()
    return
  }
  if (req.method === 'GET' && url.pathname === '/auth/me') {
    const account = await accountOf(auth, req)
    return account ? json(res, 200, { email: account.email }) : json(res, 401, { error: 'not logged in' })
  }
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const sid = req.headers.cookie?.match(new RegExp(`${COOKIE}=([^;]+)`))?.[1]
    if (sid) await auth.deleteSession(hash(sid))
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` })
    res.end(JSON.stringify({ ok: true }))
    return
  }
  json(res, 404, { error: 'not found' })
}

async function createLoginSession(opts: ServerOptions, auth: AuthStore, email: string): Promise<string> {
  const account: Account = await auth.ensureAccount(email)
  const sid = token()
  const expires = new Date(Date.now() + SESSION_TTL_MS)
  await auth.createSession(hash(sid), account.id, expires.toISOString())
  const secure = (opts.publicOrigin ?? '').startsWith('https://') ? '; Secure' : ''
  return `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

// The body as bytes, or null once it grows past `max`.
function readBytes(req: IncomingMessage, max: number): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size <= max) chunks.push(c)
    })
    req.on('end', () => resolve(size > max ? null : new Uint8Array(Buffer.concat(chunks))))
    req.on('error', reject)
  })
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

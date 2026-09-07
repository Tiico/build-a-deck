import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { WebSocketServer, type WebSocket } from 'ws'
import { z } from 'zod'
import { ClientMessage, type ServerMessage } from '@byd/protocol'
import { validateSetup, type SetupDef, type TypeRegistry } from '@byd/engine'
import { Template } from '@byd/template'
import type { RenderStore } from '@byd/render/queue'
import type { Subscriber, TableHost } from './actor.js'
import type { Deck, LogStore } from './store.js'
import { ProjectDoc, deckFromProject, setupFromProject, type ProjectRecord, type ProjectStore } from './projects.js'
import { SurveyAnswer, type SurveyStore } from './surveys.js'
import { COOKIE, LoginBody, LoginLimiter, SESSION_TTL_MS, TOKEN_TTL_MS, accountOf, hash, loginMail, safeNext, token, type Account, type AuthStore, type Mailer } from './auth.js'
import { facesOf } from './faces.js'
import { TEXTURE_DPI } from './actor.js'

// `staticDir`: the built web app, served from the same origin as the API (README, DRIFT §1).
// `auth` and `mailer` turn on accounts (G1): projects then belong to whoever made them.
// `publicOrigin` is what login links point at; without it the request's origin is used.
export type ServerOptions = {
  host: TableHost
  store: LogStore
  registry: TypeRegistry
  renders?: RenderStore
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
}

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
    const seat = url.searchParams.get('seat')
    // An observer (C8) is seatless and named; the name is what everyone else sees.
    const observer = url.searchParams.get('role') === 'observer' ? (url.searchParams.get('name') ?? 'observatör').slice(0, 64) || 'observatör' : undefined
    wss.handleUpgrade(req, socket, head, (ws) => void attach(opts, ws, sessionId, observer === undefined ? seat : null, observer))
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
// In development the editor is served from another port than the server, so the origin is
// echoed and credentials allowed; in production everything is one origin.
const CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
}
async function route(opts: ServerOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const origin = req.headers.origin
  if (origin) {
    CORS['access-control-allow-origin'] = origin
    CORS['access-control-allow-credentials'] = 'true'
    CORS['vary'] = 'origin'
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
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
      return json(res, 200, { ok: true, tables: loaded.length, store: 'ok' })
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
    if (opts.projects) {
      const handled = await routeProjects(opts, opts.projects, req, res, url)
      if (handled) return
    }
    const face = /^\/faces\/([0-9a-f]{64})$/.exec(url.pathname)
    if (req.method === 'GET' && face && opts.renders) {
      // The hash is the capability: only a seat that may see a face was ever told its hash.
      const hash = face[1] ?? ''
      const bytes = await opts.renders.output(hash)
      if (bytes) {
        res.writeHead(200, { ...CORS, 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' })
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
const API_PREFIXES = ['/sessions', '/projects', '/faces', '/health']
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
  res.writeHead(200, { ...CORS, 'content-type': type, 'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache' })
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

async function attach(opts: ServerOptions, ws: WebSocket, sessionId: string, seat: string | null, observer?: string): Promise<void> {
  const send = (message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message))
  }
  const actor = await opts.host.get(sessionId)
  if (!actor) {
    send({ t: 'error', id: null, message: `unknown session ${sessionId}` })
    ws.close(4004, 'unknown session')
    return
  }
  const sub: Subscriber = { seat, id: randomUUID(), send, ...(observer !== undefined ? { observer } : {}) }
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
      if (observer !== undefined && msg.envelope.intents.some((it) => it.v !== 'flag')) {
        send({ t: 'reject', id: msg.envelope.id, reason: 'an observer can only flag' })
        return
      }
      const envelope = {
        ...msg.envelope,
        intents: msg.envelope.intents.map((it) => {
          if (it.v !== 'flag') return it
          const flag = { v: 'flag' as const, ...(it.note !== undefined ? { note: it.note } : {}) }
          return observer !== undefined ? { ...flag, observer } : flag
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
    await opts.store.createSession({ id, version: `rev-${rec.rev}`, setup: setupFromProject(rec), deck: deckFromProject(rec), project: rec.id })
    await opts.host.get(id)
    json(res, 201, { id, version: `rev-${rec.rev}` })
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
    const compiled = facesOf(deckFromProject(rec), setupFromProject(rec), opts.registry, TEXTURE_DPI, Date.now())
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
    await actor.refreshDeck(deckFromProject(rec), setup)
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
        ...CORS,
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
      ...CORS,
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
    res.writeHead(200, { ...CORS, 'content-type': 'application/json', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` })
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
  res.writeHead(status, { ...CORS, 'content-type': 'application/json' })
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

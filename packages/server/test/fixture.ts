import type { Server as SocketServer } from 'node:net'
import type { Server } from 'node:http'
import { CARD_STANDARD_63x88, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer, MemoryAssetStore } from '../src/index.js'
import type { AssetStore } from '../src/assets.js'
import { MemoryRenderStore, Renderer, runWorker, type ObjectStore } from '@byd/render'
import { WireClient } from './client.js'

export const registry = new TypeRegistry(STANDARD_TYPES)
export const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
export const CARDS = ['dragon', 'knight', 'wizard', 'rogue', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre']

const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

export function twoSeatSetup(): SetupDef {
  return {
    seats: ['A', 'B'],
    floor: 'table',
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0) },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(200, 0) },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
    ],
    components: CARDS.map((cardRef) => ({ type: CARD, cardRef, zone: 'draw', face: 'back' })),
  }
}

// A fixture never takes its port with `listen(0)` (#58). `listen(0)` is handed a port out of the
// operating system's ephemeral range, and that is the range every other worker on the machine
// draws from too: a neighbour asking for any port at all can be given the very number a fixture
// here is between servers on, and the EADDRINUSE then lands inside whatever test happened to be
// running, about a port nothing in that test named. Ports below 30000 are outside the ephemeral
// range everywhere this suite runs — it starts at 32768 on Linux and 49152 on macOS and Windows —
// so nothing the kernel hands out on its own can land on one. The floor is above 10080 for a
// second reason, which cost a green suite to find (#136): 10080 is the highest port on WHATWG
// Fetch's list of ports `fetch` will not speak to at all, so a fixture given one starts perfectly
// well and then every request to the address it hands out fails.
//
// The rule is machine-wide, and so is the collision it prevents: it happens between packages and
// not inside one, which is why it went on being broken here long after the web suite had written
// it down (#289). Every test package therefore has its own block of the band:
//
//   10_100 – 10_300  packages/e2e            one stack per run, walking for a free number
//   10_300 – 10_600  packages/render/test
//   10_600 – 11_000  packages/server/test    ← this one
//   11_000 – 30_000  packages/web/test
//
// The blocks are what makes two packages asking for one number impossible rather than unlikely,
// and they stay that way because no package can leave its own block quietly: the reckoning below
// is cut out of this block and nothing else, and `fixture-port.test.ts` beside this file fails the
// moment it no longer fits. A block is cheaper to hold to than a shared module would be — the same
// rule, written once per package, with no package reaching into another package's tests.
const PORT_FLOOR = 10_600
const PORT_CEILING = 11_000

// Four ports per worker, and not the web suite's sixty-four. The number is how far apart in time
// two fixtures in one worker have to be before they are handed the same port again, and what that
// distance stands between is a client that outlived its own server knocking on a later fixture's
// door and being let in (#109, #119). Such a client is a different animal here: every one in this
// suite is a `WireClient` the test made and closes in its own `afterEach`, where the web suite's
// lived inside a React tree that went on running after the test that mounted it. The four are
// therefore room to walk over a squatter rather than a mitigation, and what they leave over is
// spent on run slots instead — which is the collision a suite on a machine full of worktrees
// actually meets.
const PORTS_PER_WORKER = 4
// Sixteen worker slots: twice the cores of the eight-core machine the numbers in
// `test-support/one-suite-at-a-time.ts` were measured on, so a larger box does not quietly put two
// of its workers in one slice.
const WORKERS_PER_RUN = 16
const PORTS_PER_RUN = PORTS_PER_WORKER * WORKERS_PER_RUN

/**
 * This package's block and what has been cut out of it, for the test that holds it to the rule.
 *
 * `slices` is how many runs can be on this machine at once before two of them draw from the same
 * numbers — several worktrees at a time is how this repo is worked — and it is counted here rather
 * than by the caller, so that a guard on it cannot drift away from the numbers it is guarding.
 */
export function portBand(): { floor: number; ceiling: number; workers: number; slices: number } {
  return { floor: PORT_FLOOR, ceiling: PORT_CEILING, workers: WORKERS_PER_RUN, slices: Math.floor((PORT_CEILING - PORT_FLOOR) / PORTS_PER_RUN) }
}

const WORKER_SLOT = ((Number(process.env['VITEST_POOL_ID']) || 1) - 1) % WORKERS_PER_RUN
const RUN_SLOT = (process.ppid || process.pid) % portBand().slices
const SLICE = PORT_FLOOR + RUN_SLOT * PORTS_PER_RUN + WORKER_SLOT * PORTS_PER_WORKER
let nth = 0

// `listen` says it failed by emitting `error`, not by throwing. Without this the EADDRINUSE below
// would reach the worker as an uncaught exception and fell whatever test was running, which is how
// #58 was first seen.
// An `http.Server` is a `net.Server` with a protocol on top, and the port is the socket's
// business, so this is written against the plain socket server: anything in this package that has
// to listen can then take its port out of the same block, whether it speaks HTTP or not.
function listenOn(server: SocketServer, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const failed = (err: Error) => {
      server.removeListener('listening', listening)
      reject(err)
    }
    const listening = () => {
      server.removeListener('error', failed)
      resolve()
    }
    server.once('error', failed)
    server.once('listening', listening)
    server.listen(port, '127.0.0.1')
  })
}

/**
 * Listens on a port out of this worker's own slice of the block above, and says which one.
 *
 * It steps over anything another program on the machine happens to be holding, and gives up by
 * naming every number it tried: a fixture that cannot find a door has to say so itself, rather
 * than leave the next `fetch` to explain it.
 */
export async function listenInBand(server: SocketServer): Promise<number> {
  const tried: number[] = []
  for (let i = 0; i < PORTS_PER_WORKER; i++) {
    const port = SLICE + (nth % PORTS_PER_WORKER)
    nth += 1
    tried.push(port)
    try {
      await listenOn(server, port)
      return port
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(`test fixture found no free port among 127.0.0.1:${tried.join(', ')}`)
}

export type Running = {
  server: Server
  base: string
  http: string
  store: MemoryLogStore
  renders: MemoryRenderStore
  host: TableHost
  projects: MemoryProjectStore
  mail: MemoryMailer
  renderAll(): Promise<void>
  restart(): Promise<void>
  stop(): Promise<void>
  // The table's own screen, opened with the host key (DRIFT §9).
  connectTable(sessionId: string, hostKey: string): Promise<WireClient>
  // A guest's token for a seat (or for watching, with a name and no seat), bought with the code.
  admit(sessionId: string, seat: string | null, name?: string): Promise<string>
  // A connection as the table, a seat or an observer, admitted the way a real one is.
  connect(sessionId: string, seat: string | null, as?: { role: 'observer'; name: string }): Promise<WireClient>
}
// The admission of every session made through the fixture, by session id.
const rooms = new Map<string, { code: string; hostKey: string }>()

// `assets` is for a test about the gate in front of a particular store (#204): the route is the
// same route whether the bytes end up in memory or in Postgres, and a test that only ever sees one
// of them cannot say so.
export async function start(opts: { appOrigin?: string; authBypass?: boolean; objects?: ObjectStore; now?: () => Date; release?: string; projects?: MemoryProjectStore; store?: MemoryLogStore; assets?: AssetStore } = {}): Promise<Running> {
  const store = opts.store ?? new MemoryLogStore()
  const renders = new MemoryRenderStore(opts.objects)
  // A store of the test's own, for a test about what the server does while the store is answering.
  const projects = opts.projects ?? new MemoryProjectStore()
  const host = new TableHost(registry, store, undefined, renders)
  const mail = new MemoryMailer()
  const authBypass = opts.authBypass ? { authBypass: true } : {}
  const server = createServer({ host, store, registry, renders, projects, assets: opts.assets ?? new MemoryAssetStore(opts.objects), surveys: new MemorySurveyStore(), auth: new MemoryAuthStore(), mailer: mail, publicOrigin: 'http://test.local', ...(opts.appOrigin ? { appOrigin: opts.appOrigin } : {}), ...(opts.objects ? { objects: opts.objects } : {}), ...(opts.now ? { now: opts.now } : {}), ...(opts.release ? { release: opts.release } : {}), ...authBypass })
  const port = await listenInBand(server)
  const run: Running = {
    server,
    store,
    renders,
    host,
    projects,
    mail,
    // Runs a real Chromium over the queue, as the render container would.
    renderAll: async () => {
      const renderer = await Renderer.launch()
      try {
        await runWorker({ store: renders, renderer, until: 'empty' })
      } finally {
        await renderer.close()
      }
    },
    // Forgets every loaded actor, as a process restart would; the next connection reloads from the log.
    restart: () => host.drain('restart'),
    base: `ws://127.0.0.1:${port}`,
    http: `http://127.0.0.1:${port}`,
    connectTable: (sessionId, hostKey) => WireClient.connect(`ws://127.0.0.1:${port}`, sessionId, null, undefined, { host: hostKey }),
    admit: async (sessionId, seat, name) => {
      const room = rooms.get(sessionId)
      if (!room) throw new Error(`no room for ${sessionId}: make it with createRoom or register it`)
      const res = await fetch(`http://127.0.0.1:${port}/rooms/${room.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name ?? (seat === null ? 'observatör' : `Guest ${seat}`), ...(seat === null ? {} : { seat }) }) })
      if (res.status !== 201) throw new Error(`join failed: ${res.status} ${await res.text()}`)
      return ((await res.json()) as { token: string }).token
    },
    connect: async (sessionId, seat, as) => {
      const base = `ws://127.0.0.1:${port}`
      const room = rooms.get(sessionId)
      if (!room) throw new Error(`no room for ${sessionId}`)
      if (as) return WireClient.connect(base, sessionId, null, as, { token: await run.admit(sessionId, null, as.name) })
      if (seat === null) return WireClient.connect(base, sessionId, null, undefined, { host: room.hostKey })
      return WireClient.connect(base, sessionId, seat, undefined, { token: await run.admit(sessionId, seat) })
    },
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
  return run
}

export async function createSession(http: string, id = 's1'): Promise<string> {
  return (await createRoom(http, id)).id
}

// A session with what admits people to it (DRIFT §9): its code and the host's key.
export async function createRoom(http: string, id = 's1'): Promise<{ id: string; code: string; hostKey: string }> {
  const res = await fetch(`${http}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, version: 'v1', setup: twoSeatSetup() }),
  })
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  rooms.set(made.id, { code: made.code, hostKey: made.hostKey })
  return made
}

// A session made elsewhere (a project's table), so the fixture can admit people to it.
export function registerRoom(id: string, room: { code: string; hostKey: string }): void {
  rooms.set(id, room)
}

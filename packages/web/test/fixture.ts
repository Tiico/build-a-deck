import type { Server } from 'node:http'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer, MemoryAssetStore } from '@byd/server'
import { openingSetup, type Recipe } from '@byd/server/doc'
import { MemoryRenderStore } from '@byd/render/queue'

// A real server in-process. Client tests talk to it over a real socket — no mocks.
export const registry = new TypeRegistry(STANDARD_TYPES)
// A fresh reference each time it is asked for, so that no two components in a setup — and
// no two setups — are looking at the one object (#49).
const CARD = () => ({ id: CARD_STANDARD_63x88.id, version: 1 })
const CARDS = ['dragon', 'knight', 'wizard', 'rogue', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre']
const rect = (x: number, y: number, w: number, h: number) => ({ x, y, w, h, rot: 0 })
const point = (x: number, y: number) => ({ x, y, w: 0, h: 0, rot: 0 })

export function twoSeatSetup(): SetupDef {
  return {
    seats: ['A', 'B'],
    floor: 'table',
    zones: [
      { id: 'draw', kind: 'pile', name: 'Draghög', visibility: 'none', geometry: point(-200, 0), shortcut: { label: 'Lägg underst', at: 'bottom' } },
      { id: 'discard', kind: 'pile', name: 'Kasthög', visibility: 'all', geometry: point(200, 0), shortcut: { label: 'Kasta', at: 'top' } },
      { id: 'table', kind: 'area', name: 'Spelyta', visibility: 'all', geometry: rect(-500, -300, 1000, 600) },
      { id: 'hand:A', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'A', returnTo: 'draw', geometry: rect(-300, 320, 600, 100) },
      { id: 'hand:B', kind: 'hand', name: 'Hand', visibility: 'owner', owner: 'B', returnTo: 'draw', geometry: rect(-300, -420, 600, 100) },
    ],
    components: CARDS.map((cardRef) => ({ type: CARD(), cardRef, zone: 'draw', face: 'back' })),
  }
}

// A table laid out the way the wizard lays one out, for any number of seats the recipe allows:
// a hand, an area in front and, when there are counters, a counters zone at every seat, plus the
// draw and discard piles. Past four players two people sit along the same side of the felt, so
// this is the only way to get a table whose seats share an edge (#42).
export function recipeSetup(players: number, counters: Recipe['counters'] = []): SetupDef {
  const setup = openingSetup({ players, counters })
  return {
    seats: setup.seats,
    floor: setup.floor,
    zones: setup.zones.map((z) => ({ id: z.id, kind: z.kind, name: z.name, visibility: z.visibility, geometry: z.geometry, ...(z.owner ? { owner: z.owner } : {}), ...(z.returnTo ? { returnTo: z.returnTo } : {}), ...(z.shortcut ? { shortcut: z.shortcut } : {}) })),
    components: CARDS.map((cardRef) => ({ type: CARD(), cardRef, zone: setup.deckZone, face: 'back' })),
  }
}

// A setup where every seat owns an area in front of it and a counters zone with two counters
// (C4), as the wizard makes them.
export function seatSetup(): SetupDef {
  const base = twoSeatSetup()
  const token = () => ({ id: TOKEN_COUNTER.id, version: 1 })
  return {
    ...base,
    zones: [
      ...base.zones,
      { id: 'mine:A', kind: 'area', name: 'Framför A', visibility: 'owner', owner: 'A', geometry: rect(-300, 220, 380, 90), shortcut: { label: 'Framför mig', at: 'top' } },
      { id: 'mine:B', kind: 'area', name: 'Framför B', visibility: 'owner', owner: 'B', geometry: rect(-300, -310, 380, 90), shortcut: { label: 'Framför mig', at: 'top' } },
      { id: 'counters:A', kind: 'area', name: 'Räknare A', visibility: 'all', owner: 'A', geometry: rect(100, 220, 110, 90) },
      { id: 'counters:B', kind: 'area', name: 'Räknare B', visibility: 'all', owner: 'B', geometry: rect(100, -310, 110, 90) },
    ],
    components: [
      ...base.components,
      ...(['A', 'B'] as const).flatMap((s) => [
        { type: token(), cardRef: 'Liv', zone: `counters:${s}`, face: 'front', counter: 20, x: 8, y: 8 },
        { type: token(), cardRef: 'Guld', zone: `counters:${s}`, face: 'front', counter: 3, x: 40, y: 8 },
      ]),
    ],
  }
}

// A fixture never takes its port with `listen(0)` (#58). `listen(0)` is handed a port out of the
// operating system's ephemeral range, and that is the range every other worker draws from too: in
// the gap where `restart()` has let go of its port in order to bind the same one again, a
// neighbour asking for any port at all can be given that very number, and the restart then falls
// over an EADDRINUSE inside whatever test happened to be running. Ports below 30000 are outside
// the ephemeral range everywhere the suite runs — it starts at 32768 on Linux and 49152 on macOS
// and Windows — so nothing the kernel hands out on its own can land on one.
// The floor is above 10080 and not at 10000 for a second reason, which cost a green suite to
// find (#136): 10080 is the highest port on WHATWG Fetch's list of ports `fetch` will not speak
// to at all. `listen` knows nothing of that list, so a fixture given 10080 starts perfectly well
// and then every request to the address it hands out fails — as `TypeError: fetch failed, Caused
// by: bad port`, inside whatever test was using it, about a port nothing in that test named.
const PORT_FLOOR = 11_000
const PORT_CEILING = 30_000
// The band is cut so that no two fixtures alive at the same time ever want the same number: a
// slice per test worker, a counter walking that slice, and the whole run moved aside by the pid
// of the process the workers hang off, so a second suite on the same box sits somewhere else.
// Sixty-four and not eight (#109). The number is how far apart in time two fixtures in one worker
// have to be before they are given the same port, and that distance is what stands between a
// client that outlived its own server and a later fixture's door.
//
// It matters because a project id is the caller's word and not a unique one: nearly every file
// here used to ask for `run.projects.create('p1', …)`, so two fixtures a slice apart held two
// different projects under one name (#119 took the name off the caller; this is why). A stray client knocking on the recycled port asks for `p1`, is let in
// because that server has a `p1` too, and lays its own edits on a project it was never opened on.
// It has been seen twice: a font losing the licence just set on it (#109), and a table started at
// `rev-2` when both of a pair should have read `rev-1`, a stray save having come between them.
//
// Eight is the distance at which that is reachable — `project-client.test.ts` alone starts
// twenty-five fixtures, so its ninth test listens where its first one did. Sixty-four puts every
// file in this suite past its own end. It is a mitigation and not a proof: the honest fix is for
// two projects never to answer to one name, which is a rename across twenty-six files and is
// written down rather than done here.
const PORTS_PER_WORKER = 64
const WORKERS_PER_RUN = 32
const PORTS_PER_RUN = PORTS_PER_WORKER * WORKERS_PER_RUN

// The band, for anything that has to hold it to a rule: what is in it is what a fixture can be
// given, and every one of those has to be an address a test can then fetch. `slices` is counted
// here rather than by the caller, so that a guard on how many runs the band still holds cannot
// drift away from the numbers it is guarding.
export function portBand(): { floor: number; ceiling: number; slices: number } {
  return { floor: PORT_FLOOR, ceiling: PORT_CEILING, slices: Math.floor((PORT_CEILING - PORT_FLOOR) / PORTS_PER_RUN) }
}

const WORKER_SLOT = ((Number(process.env['VITEST_POOL_ID']) || 1) - 1) % WORKERS_PER_RUN
const RUN_SLOT = (process.ppid || process.pid) % portBand().slices
const SLICE = PORT_FLOOR + RUN_SLOT * PORTS_PER_RUN + WORKER_SLOT * PORTS_PER_WORKER
let nth = 0

// `listen` says it failed by emitting `error`, not by throwing. Without this the EADDRINUSE
// below would reach the worker as an uncaught exception and fell whatever test was running,
// which is how #58 was first seen.
function listenOn(server: Server, port: number): Promise<void> {
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

// The port for a new fixture: this worker's own slice, stepping over anything another program on
// the machine happens to be holding.
async function claim(server: Server): Promise<number> {
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

// Taking a port back can fail for a moment even when nothing is wrong — `close()` has returned
// but the kernel may still be letting the socket go — and it can be held outright by another
// program on the machine. Keep asking for a short while, then say which port it was.
async function bind(server: Server, port: number): Promise<void> {
  const until = Date.now() + 1_000
  for (let wait = 5; ; wait = Math.min(wait * 2, 100)) {
    try {
      await listenOn(server, port)
      return
    } catch (err) {
      const again = (err as NodeJS.ErrnoException).code === 'EADDRINUSE' && Date.now() < until
      if (!again) throw new Error(`test fixture could not listen on 127.0.0.1:${port}: ${(err as Error).message}`)
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
}

// How long a fixture is given to answer its own address before whatever is being built against it
// gives up on it (#149).
//
// The number this replaces is the four seconds a `waitFor` has in `setup.ts`, and four seconds is
// what proved too short under a full run. It could not have been mended by giving the screen more
// of them: the editor opens a project with a single `fetch` and keeps no second attempt, so a
// surface that lost that one request stood on the disconnected screen for the rest of the test
// however long anything waited for a word to appear on it. The patience is therefore spent here,
// on asking the server again, which is the one thing the surface itself cannot do.
//
// Eight seconds, then. Twice the four that were not enough, and twelve short of the twenty a
// suite in this class is given (`budget.ts`), so a server that never comes fells the run as a red
// test naming the address it waited on — promptly, and long before the budget around it is spent.
export const ANSWERS_WITHIN = 8_000

// The fixture's own word for "I am answering": a real request over the address it hands out,
// asked again until it comes back. `/health` is the server saying that its store answers and not
// merely that the process is up (DRIFT §2). A door named by the caller is asked for instead, which
// is how a table says its own actor is standing and not only that the server around it is.
async function untilAnswering(http: string, door: string): Promise<void> {
  const until = Date.now() + ANSWERS_WITHIN
  let why = 'it was never asked'
  for (let wait = 5; ; wait = Math.min(wait * 2, 100)) {
    try {
      const res = await fetch(`${http}${door}`)
      if (res.ok) return
      why = `${res.status} ${(await res.text()).trim().slice(0, 120)}`
    } catch (err) {
      why = (err as Error).message
    }
    if (Date.now() >= until) throw new Error(`test fixture at ${http} never answered ${door} within ${ANSWERS_WITHIN} ms: ${why}`)
    await new Promise((resolve) => setTimeout(resolve, wait))
  }
}

export type Running = {
  url: string
  http: string
  store: MemoryLogStore
  projects: MemoryProjectStore
  mail: MemoryMailer
  /**
   * This fixture's project id, and no other fixture's (#109, #119).
   *
   * A project id used to be the caller's word — every file wrote `create('p1', …)` — so two
   * fixtures held two different projects under one name. That is harmless until they share a
   * port, and the ports go round: a client that outlived its own server then knocks on a later
   * fixture's door, asks for `p1`, is let in because that server has a `p1` too, and lays its own
   * edits on a project it was never opened on. It was seen as a font losing the licence just set
   * on it, and as a table started at `rev-2` when both of a pair should have read `rev-1`.
   *
   * So the name is the fixture's to give and never the caller's. Use it wherever a project is
   * addressed — in the store, in a URL, in a body — so that the two always agree.
   */
  projectId: string
  /** A second project for the one test that needs two at once. Its own name, on the same ground. */
  otherProjectId: string
  /**
   * Waits until this fixture is answering, by asking it (#149).
   *
   * A surface built against a fixture used to learn that the server was up by finding a word the
   * fixture's project happens to carry — `Skogens herrar` — on the screen. That is content, and
   * content is not a statement about the server: it appears once an answer has come, so a surface
   * waiting for it is timing the server rather than measuring it, and under a full run the timing
   * lost. This is the fixture saying the thing that was actually being asked.
   *
   * With no door named it is `/health`, the server's own word for a store that answers. Name one
   * — `/sessions/<id>` — to wait on something standing behind the server rather than on the
   * server itself.
   */
  answering(door?: string): Promise<void>
  stop(): Promise<void>
  restart(): Promise<void>
  completeRenders(limit?: number): Promise<number>
  failRenders(): Promise<number>
}
// Enough to tell two fixtures apart within a worker, which is as far as a port ever travels.
let fixtures = 0

// With `auth`, accounts are on (G1): projects need a login and belong to whoever made them.
export async function startServer(opts: { auth?: boolean; authBypass?: boolean } = {}): Promise<Running> {
  const store = new MemoryLogStore()
  const projects = new MemoryProjectStore()
  const renders = new MemoryRenderStore()
  const surveys = new MemorySurveyStore()
  const mail = new MemoryMailer()
  const auth = opts.auth ? new MemoryAuthStore() : undefined
  let http = ''
  const assets = new MemoryAssetStore()
  const make = () => createServer({ host: new TableHost(registry, store, undefined, renders), store, registry, renders, projects, assets, surveys, ...(auth ? { auth, mailer: mail, publicOrigin: http, authBypass: opts.authBypass } : {}) })
  let server: Server = make()
  const port = await claim(server)
  http = `http://127.0.0.1:${port}`
  const stop = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  const nth = (fixtures += 1)
  return {
    url: `ws://127.0.0.1:${port}`,
    http: `http://127.0.0.1:${port}`,
    store,
    projects,
    mail,
    projectId: `p1-f${nth}`,
    otherProjectId: `p2-f${nth}`,
    answering: (door = '/health') => untilAnswering(`http://127.0.0.1:${port}`, door),
    stop,
    // Marks every queued texture as rendered, with a stand-in for the PNG: what the render
    // container would do, without Chromium. A limit renders only that many, which is a worker
    // that has come along part of the way.
    completeRenders: async (limit = Infinity) => {
      let n = 0
      while (n < limit) {
        const job = await renders.claim(Date.now())
        if (!job) break
        await renders.complete(job.hash, new Uint8Array([137, 80, 78, 71]))
        n++
      }
      return n
    },
    // The other ending: every queued texture dies the way a render container that keeps
    // crashing on the same page would leave it — failed for good, not merely late (#10).
    failRenders: async () => {
      let n = 0
      for (;;) {
        const job = await renders.claim(Date.now())
        if (!job) return n
        await renders.fail(job.hash, 'synthetic render failure')
        n++
      }
    },
    // Same port, same store: what a deploy on the box looks like from the client's side.
    restart: async () => {
      await stop()
      server = make()
      await bind(server, port)
    },
  }
}

// Admission (DRIFT §9), by session id: what the fixture made each session with.
const rooms = new Map<string, { code: string; hostKey: string }>()

// A session made through the server, so it has a code and a host key; `deck` optional.
export async function createSession(run: Running, id = 's1', deck?: unknown, setup: SetupDef = twoSeatSetup()): Promise<string> {
  const res = await fetch(`${run.http}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, version: 'v1', setup, ...(deck ? { deck } : {}) }) })
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  rooms.set(made.id, { code: made.code, hostKey: made.hostKey })
  return made.id
}

// A session made elsewhere (a project's table), so the fixture can admit people to it.
export function registerRoom(id: string, room: { code: string; hostKey: string }): void {
  rooms.set(id, room)
}

export function roomOf(id: string): { code: string; hostKey: string } {
  const room = rooms.get(id)
  if (!room) throw new Error(`no room for ${id}`)
  return room
}

// A guest token for a seat (or for watching, with no seat), bought with the room's code.
export async function admit(run: Running, id: string, seat: string | null, name = seat === null ? 'Eva' : `Guest ${seat}`): Promise<string> {
  const res = await fetch(`${run.http}/rooms/${roomOf(id).code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, ...(seat === null ? {} : { seat }) }) })
  if (res.status !== 201) throw new Error(`join failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { token: string }).token
}

// Connection options admitted the way a real one is: the table with the host key, a seat or
// an observer with a token.
export async function asTable(run: Running, id: string): Promise<{ url: string; sessionId: string; seat: null; host: string }> {
  return { url: run.url, sessionId: id, seat: null, host: roomOf(id).hostKey }
}
export async function asSeat(run: Running, id: string, seat: string, name?: string): Promise<{ url: string; sessionId: string; seat: string; token: string }> {
  return { url: run.url, sessionId: id, seat, token: await admit(run, id, seat, name) }
}
export async function asObserver(run: Running, id: string, name: string): Promise<{ url: string; sessionId: string; seat: null; observer: string; token: string }> {
  return { url: run.url, sessionId: id, seat: null, observer: name, token: await admit(run, id, null, name) }
}

// A table started from a project, the way the editor starts one (L5): the game has a name.
export async function createNamedSession(run: Running, name: string, id = 's1'): Promise<string> {
  const { zones, seats, floor } = twoSeatSetup()
  await run.projects.create(`p-${id}`, { name, template: { faces: { front: { base: [], variants: {} }, back: { base: [], variants: {} } } }, rows: [], icons: {}, setup: { zones, seats, floor, deckZone: 'draw' } })
  const res = await fetch(`${run.http}/projects/p-${id}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  if (res.status !== 201) throw new Error(`create named session failed: ${res.status} ${await res.text()}`)
  const made = (await res.json()) as { id: string; code: string; hostKey: string }
  rooms.set(made.id, { code: made.code, hostKey: made.hostKey })
  return made.id
}

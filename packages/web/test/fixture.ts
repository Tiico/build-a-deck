import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { CARD_STANDARD_63x88, TOKEN_COUNTER, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer, MemoryAssetStore } from '@byd/server'
import { applyRecipe, emptySetup } from '@byd/server/doc'
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

// A table laid out the way the wizard lays one out, for any number of seats the recipe allows.
// Past four players the recipe seats two people along the same side of the felt, so this is the
// only way to get a table whose seats share an edge (#42).
export function recipeSetup(players: number): SetupDef {
  const setup = applyRecipe(emptySetup(), { players, mine: false, discard: false, market: false, counters: [] })
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

export type Running = { url: string; http: string; store: MemoryLogStore; projects: MemoryProjectStore; mail: MemoryMailer; stop(): Promise<void>; restart(): Promise<void>; completeRenders(): Promise<number>; failRenders(): Promise<number> }

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
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  http = `http://127.0.0.1:${port}`
  const stop = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  return {
    url: `ws://127.0.0.1:${port}`,
    http: `http://127.0.0.1:${port}`,
    store,
    projects,
    mail,
    stop,
    // Marks every queued texture as rendered, with a stand-in for the PNG: what the render
    // container would do, without Chromium.
    completeRenders: async () => {
      let n = 0
      for (;;) {
        const job = await renders.claim(Date.now())
        if (!job) return n
        await renders.complete(job.hash, new Uint8Array([137, 80, 78, 71]))
        n++
      }
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
      await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
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

import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { CARD_STANDARD_63x88, TypeRegistry, type SetupDef, STANDARD_TYPES } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer } from '../src/index.js'
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

export async function start(opts: { appOrigin?: string; authBypass?: boolean; objects?: ObjectStore; now?: () => Date } = {}): Promise<Running> {
  const store = new MemoryLogStore()
  const renders = new MemoryRenderStore(opts.objects)
  const projects = new MemoryProjectStore()
  const host = new TableHost(registry, store, undefined, renders)
  const mail = new MemoryMailer()
  const authBypass = opts.authBypass ? { authBypass: true } : {}
  const server = createServer({ host, store, registry, renders, projects, surveys: new MemorySurveyStore(), auth: new MemoryAuthStore(), mailer: mail, publicOrigin: 'http://test.local', ...(opts.appOrigin ? { appOrigin: opts.appOrigin } : {}), ...(opts.objects ? { objects: opts.objects } : {}), ...(opts.now ? { now: opts.now } : {}), ...authBypass })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
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

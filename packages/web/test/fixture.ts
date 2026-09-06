import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { CARD_STANDARD_63x88, TypeRegistry, type SetupDef } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore } from '@byd/server'

// A real server in-process. Client tests talk to it over a real socket — no mocks.
export const registry = new TypeRegistry([CARD_STANDARD_63x88])
const CARD = { id: CARD_STANDARD_63x88.id, version: 1 }
const CARDS = ['dragon', 'knight', 'wizard', 'rogue', 'priest', 'archer', 'golem', 'witch', 'bard', 'ogre']
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

export type Running = { url: string; store: MemoryLogStore; stop(): Promise<void>; restart(): Promise<void> }

export async function startServer(): Promise<Running> {
  const store = new MemoryLogStore()
  const host = new TableHost(registry, store)
  let server: Server = createServer({ host, store, registry })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const stop = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  return {
    url: `ws://127.0.0.1:${port}`,
    store,
    stop,
    // Same port, same store: what a deploy on the box looks like from the client's side.
    restart: async () => {
      await stop()
      server = createServer({ host: new TableHost(registry, store), store, registry })
      await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve))
    },
  }
}

export async function createSession(store: MemoryLogStore, id = 's1'): Promise<string> {
  await store.createSession({ id, version: 'v1', setup: twoSeatSetup() })
  return id
}

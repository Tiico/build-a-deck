import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { CARD_STANDARD_63x88, TypeRegistry, type SetupDef } from '@byd/engine'
import { TableHost, createServer, MemoryLogStore, MemoryProjectStore, MemorySurveyStore, MemoryAuthStore, MemoryMailer } from '../src/index.js'
import { MemoryRenderStore, Renderer, runWorker } from '@byd/render'

export const registry = new TypeRegistry([CARD_STANDARD_63x88])
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

export type Running = { server: Server; base: string; http: string; store: MemoryLogStore; renders: MemoryRenderStore; host: TableHost; projects: MemoryProjectStore; mail: MemoryMailer; renderAll(): Promise<void>; restart(): Promise<void>; stop(): Promise<void> }

export async function start(): Promise<Running> {
  const store = new MemoryLogStore()
  const renders = new MemoryRenderStore()
  const projects = new MemoryProjectStore()
  const host = new TableHost(registry, store, undefined, renders)
  const mail = new MemoryMailer()
  const server = createServer({ host, store, registry, renders, projects, surveys: new MemorySurveyStore(), auth: new MemoryAuthStore(), mailer: mail, publicOrigin: 'http://test.local' })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
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
    stop: () =>
      new Promise((resolve) => {
        server.closeAllConnections()
        server.close(() => resolve())
      }),
  }
}

export async function createSession(http: string, id = 's1'): Promise<string> {
  const res = await fetch(`${http}/sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id, version: 'v1', setup: twoSeatSetup() }),
  })
  if (res.status !== 201) throw new Error(`create failed: ${res.status} ${await res.text()}`)
  return ((await res.json()) as { id: string }).id
}

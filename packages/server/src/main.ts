import { CARD_STANDARD_63x88, TypeRegistry } from '@byd/engine'
import { TableHost } from './actor.js'
import { createServer } from './server.js'
import { MemoryLogStore, type LogStore } from './store.js'
import { MemoryProjectStore, type ProjectStore } from './projects.js'
import { PostgresLogStore } from './store-postgres.js'
import { MemoryRenderStore, PostgresRenderStore, type RenderStore } from '@byd/render/queue'

// Entry point for the container. Configuration is environment only.
//   DATABASE_URL   — Postgres; without it the log lives in memory and dies with the process.
//   PORT           — default 8080
//   IDLE_EVICT_MS  — unload tables with no connections for this long; default 30 min

const port = Number(process.env['PORT'] ?? 8080)
const idleEvictMs = Number(process.env['IDLE_EVICT_MS'] ?? 30 * 60 * 1000)
const databaseUrl = process.env['DATABASE_URL']

const registry = new TypeRegistry([CARD_STANDARD_63x88])

let store: LogStore
let renders: RenderStore
let projects: ProjectStore
let closeStore: () => Promise<void> = async () => undefined
if (databaseUrl) {
  const pg = PostgresLogStore.connect(databaseUrl)
  await pg.migrate()
  // The render queue lives in the same database; the render container drains it (DRIFT §6).
  const rq = PostgresRenderStore.connect(databaseUrl)
  await rq.migrate()
  store = pg
  renders = rq
  projects = pg.projects()
  closeStore = async () => {
    await pg.close()
    await rq.close()
  }
  console.log(JSON.stringify({ msg: 'store', kind: 'postgres' }))
} else {
  store = new MemoryLogStore()
  renders = new MemoryRenderStore()
  projects = new MemoryProjectStore()
  console.log(JSON.stringify({ msg: 'store', kind: 'memory', warning: 'log is not durable; textures render nowhere' }))
}

const host = new TableHost(registry, store, undefined, renders)
const server = createServer({ host, store, registry, renders, projects })
server.listen(port, () => console.log(JSON.stringify({ msg: 'listening', port })))

const evictor = setInterval(() => {
  void host.evictIdle(idleEvictMs).then((ids) => {
    if (ids.length > 0) console.log(JSON.stringify({ msg: 'evicted', tables: ids }))
  })
}, 60_000)

// Drain (DRIFT §3): stop accepting, let in-flight envelopes commit, tell clients to
// reconnect, then exit. The pull-based deploy on the box relies on this being quick.
let draining = false
async function drain(signal: string): Promise<void> {
  if (draining) return
  draining = true
  console.log(JSON.stringify({ msg: 'draining', signal }))
  clearInterval(evictor)
  await host.drain('server restarting')
  server.close()
  await closeStore()
  console.log(JSON.stringify({ msg: 'drained' }))
  process.exit(0)
}
process.on('SIGTERM', () => void drain('SIGTERM'))
process.on('SIGINT', () => void drain('SIGINT'))

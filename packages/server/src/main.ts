import { CARD_STANDARD_63x88, TypeRegistry } from '@byd/engine'
import { TableHost } from './actor.js'
import { createServer } from './server.js'
import { MemoryLogStore, type LogStore } from './store.js'
import { MemoryProjectStore, type ProjectStore } from './projects.js'
import { MemorySurveyStore, type SurveyStore } from './surveys.js'
import { ConsoleMailer, MemoryAuthStore, ResendMailer, type AuthStore, type Mailer } from './auth.js'
import { PostgresLogStore } from './store-postgres.js'
import { MemoryRenderStore, PostgresRenderStore, type RenderStore } from '@byd/render/queue'

// Entry point for the container. Configuration is environment only.
//   DATABASE_URL   — Postgres; without it the log lives in memory and dies with the process.
//   PORT           — default 8080
//   IDLE_EVICT_MS  — unload tables with no connections for this long; default 30 min
//   IDLE_END_MS    — end tables nobody has touched for this long (C9); default 24 h
//   STATIC_DIR     — the built web app to serve from this origin; unset in development
//   PUBLIC_ORIGIN  — what login links point at, e.g. https://deck.example; default: the request's
//   WEB_ORIGIN     — where the browser lands after a login link; only in development, where the
//                    web app is served from another port than the API
//   RESEND_API_KEY, MAIL_FROM — mail through Resend (DRIFT §12); without a key links go to the log

const port = Number(process.env['PORT'] ?? 8080)
const idleEvictMs = Number(process.env['IDLE_EVICT_MS'] ?? 30 * 60 * 1000)
const databaseUrl = process.env['DATABASE_URL']
const idleEndMs = Number(process.env['IDLE_END_MS'] ?? 24 * 3600 * 1000)

const registry = new TypeRegistry([CARD_STANDARD_63x88])

let store: LogStore
let renders: RenderStore
let projects: ProjectStore
let surveys: SurveyStore
let auth: AuthStore
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
  surveys = pg.surveys()
  auth = pg.auth()
  closeStore = async () => {
    await pg.close()
    await rq.close()
  }
  console.log(JSON.stringify({ msg: 'store', kind: 'postgres' }))
} else {
  store = new MemoryLogStore()
  renders = new MemoryRenderStore()
  projects = new MemoryProjectStore()
  surveys = new MemorySurveyStore()
  auth = new MemoryAuthStore()
  console.log(JSON.stringify({ msg: 'store', kind: 'memory', warning: 'log is not durable; textures render nowhere' }))
}

const host = new TableHost(registry, store, undefined, renders)
const staticDir = process.env['STATIC_DIR']
const publicOrigin = process.env['PUBLIC_ORIGIN']
const appOrigin = process.env['WEB_ORIGIN']
const resendKey = process.env['RESEND_API_KEY']
const mailer: Mailer = resendKey ? new ResendMailer(resendKey, process.env['MAIL_FROM'] ?? 'build-your-deck <login@example.com>') : new ConsoleMailer()
const server = createServer({ host, store, registry, renders, projects, surveys, auth, mailer, ...(staticDir ? { staticDir } : {}), ...(publicOrigin ? { publicOrigin } : {}), ...(appOrigin ? { appOrigin } : {}) })
server.listen(port, () => console.log(JSON.stringify({ msg: 'listening', port })))

const evictor = setInterval(() => {
  void host.evictIdle(idleEvictMs).then((ids) => {
    if (ids.length > 0) console.log(JSON.stringify({ msg: 'evicted', tables: ids }))
  })
}, 60_000)
// The timeout in C9: a table nobody has touched for a day ends for the group that forgot it.
const sweeper = setInterval(() => {
  void host.endStale(new Date(Date.now() - idleEndMs)).then((ids) => {
    if (ids.length > 0) console.log(JSON.stringify({ msg: 'ended-stale', tables: ids }))
  })
}, 3600_000)

// Drain (DRIFT §3): stop accepting, let in-flight envelopes commit, tell clients to
// reconnect, then exit. The pull-based deploy on the box relies on this being quick.
let draining = false
async function drain(signal: string): Promise<void> {
  if (draining) return
  draining = true
  console.log(JSON.stringify({ msg: 'draining', signal }))
  clearInterval(evictor)
  clearInterval(sweeper)
  await host.drain('server restarting')
  server.close()
  await closeStore()
  console.log(JSON.stringify({ msg: 'drained' }))
  process.exit(0)
}
process.on('SIGTERM', () => void drain('SIGTERM'))
process.on('SIGINT', () => void drain('SIGINT'))

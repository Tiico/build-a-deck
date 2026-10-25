import { TypeRegistry, STANDARD_TYPES } from '@byd/engine'
import { TableHost } from './actor.js'
import { createServer } from './server.js'
import { MemoryLogStore, type LogStore } from './store.js'
import { MemoryProjectStore, type ProjectStore } from './projects.js'
import { MemorySurveyStore, type SurveyStore } from './surveys.js'
import { MemoryAuthStore, mailerFromEnv, type AuthStore } from './auth.js'
import { corpusFromEnv } from './corpus.js'
import { MemoryAssetStore, type AssetStore } from './assets.js'
import { PostgresLogStore } from './store-postgres.js'
import { randomBytes } from 'node:crypto'
import { AiKeyVault, MemoryAiKeyStore, masterKeyFrom, type AiKeyStore } from './ai-keys.js'
import { providersFromEnv } from './ai-providers.js'
import { MemoryRenderStore, PostgresRenderStore, assetsFromEnv, type RenderStore } from '@byd/render/queue'
import { MemoryAccountPlanStore, plansAtStart, type AccountPlanStore } from './account-plans.js'
import { plansFromEnv, plansLine } from './quotas.js'
import { printProvidersOf } from './print-providers.js'

// The tiers stop the start when they cannot be read (#1192): an error must never quietly become
// unlimited, nor quietly become closed. Said in the log, then out — before anything else is opened,
// so a broken variable costs no database connection.
const refusePlans = (e: unknown): never => {
  console.error(JSON.stringify({ msg: 'plans', error: (e as Error).message }))
  process.exit(1)
}
try {
  plansFromEnv(process.env)
} catch (e) {
  refusePlans(e)
}

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
//   AUTH_BYPASS    — `true` logs in immediately after POST /auth/login; local/test use only
//   BYD_CORPUS_ACCOUNTS, BYD_OPERATOR — the replay corpus (DRIFT §7, #1011): the accounts that said
//                    yes in their invitation, and the operator who may read their tables' exports
//   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ASSETS_BUCKET — rendered textures
//                    and print files in R2 (DRIFT §4), served through short-lived signed links;
//                    without them the bytes stay in Postgres and go through this process
//   AI_KEY_SECRET  — the master key the designers' own AI keys are sealed with (#999, DRIFT §5):
//                    32 random bytes in base64 (`openssl rand -base64 32`). Kept in the box's
//                    environment only, never in the database or its backups. Without it, keys in
//                    Postgres cannot be saved or opened and read as no key; in memory a key for
//                    this process alone is made, since the keys die with the process anyway
//   AI_ANTHROPIC_URL, AI_OPENAI_URL — where the providers are; only a test stack sets them
//   BYD_PLANS      — the tiers and their ceilings (#1193, A2, DRIFT §12), JSON on one line:
//                    {"default":"free","plans":{"free":{"projects":3},"pro":{}}}. A ceiling is a whole
//                    number or null, and a measure a tier does not name is unlimited. Unset or empty,
//                    nothing is limited — the beta's state. Set and unreadable, or missing a tier an
//                    account has, the app does not start, and the log says why

const port = Number(process.env['PORT'] ?? 8080)
const idleEvictMs = Number(process.env['IDLE_EVICT_MS'] ?? 30 * 60 * 1000)
const databaseUrl = process.env['DATABASE_URL']
const idleEndMs = Number(process.env['IDLE_END_MS'] ?? 24 * 3600 * 1000)

const registry = new TypeRegistry(STANDARD_TYPES)
const objects = assetsFromEnv(process.env)

let store: LogStore
let renders: RenderStore
let projects: ProjectStore
let surveys: SurveyStore
let auth: AuthStore
let assets: AssetStore
let aiKeys: AiKeyStore
let accountPlans: AccountPlanStore
let closeStore: () => Promise<void> = async () => undefined
if (databaseUrl) {
  const pg = PostgresLogStore.connect(databaseUrl)
  await pg.migrate()
  // The render queue lives in the same database; the render container drains it (DRIFT §6).
  const rq = PostgresRenderStore.connect(databaseUrl, objects)
  await rq.migrate()
  store = pg
  renders = rq
  projects = pg.projects()
  surveys = pg.surveys()
  auth = pg.auth()
  assets = pg.assets(objects)
  aiKeys = pg.aiKeys()
  accountPlans = pg.accountPlans()
  closeStore = async () => {
    await pg.close()
    await rq.close()
  }
  console.log(JSON.stringify({ msg: 'store', kind: 'postgres', assets: objects ? 'r2' : 'postgres' }))
} else {
  store = new MemoryLogStore()
  renders = new MemoryRenderStore()
  assets = new MemoryAssetStore()
  // Weighs the pictures its games name in the same asset store (#1197).
  projects = new MemoryProjectStore(assets)
  surveys = new MemorySurveyStore()
  auth = new MemoryAuthStore()
  aiKeys = new MemoryAiKeyStore()
  accountPlans = new MemoryAccountPlanStore()
  console.log(JSON.stringify({ msg: 'store', kind: 'memory', warning: 'log is not durable; textures render nowhere' }))
}

const host = new TableHost(registry, store, undefined, renders)
const staticDir = process.env['STATIC_DIR']
const publicOrigin = process.env['PUBLIC_ORIGIN']
const appOrigin = process.env['WEB_ORIGIN']
const authBypass = process.env['AUTH_BYPASS'] === 'true'
// What deploy.sh rolled to (DRIFT §7). Unset outside the box, and then /health says nothing
// about a release rather than inventing one.
const release = process.env['BYD_TAG']
// Where a beta tester turns (#757): set on the box, said in the footers and the login mail, and
// left out wherever it is unset.
const contact = process.env['BYD_CONTACT']
const mailer = mailerFromEnv(process.env)
const master = masterKeyFrom(process.env['AI_KEY_SECRET']) ?? (databaseUrl ? null : randomBytes(32))
const ai = { vault: new AiKeyVault(aiKeys, master), providers: providersFromEnv(process.env) }
// Whether keys can be kept, said once at start; never the secret, and never a key (DRIFT §8).
console.log(JSON.stringify({ msg: 'ai-keys', sealing: master !== null, ...(master === null ? { warning: 'AI_KEY_SECRET is unset or not 32 bytes; AI keys cannot be saved' } : {}) }))
// Read once: an account taken off the list is shut out at the next start (#1011). The log says how
// many are on it, so the box can be asked whether a change took; never who.
const corpus = corpusFromEnv(process.env)
if (corpus) console.log(JSON.stringify({ msg: 'corpus', accounts: corpus.accounts.length }))
// Read once, and held up against every tier an account has (#1193). The line says the tiers' names,
// the default and whether any ceiling is set at all; never who has which (DRIFT §8).
const plans = await plansAtStart(process.env, accountPlans).catch(refusePlans)
console.log(JSON.stringify(plansLine(plans)))
// Testtryckeriet stands where a print partner will (F1, F2, #1208): the print package is prepared
// by it, so what the designer sees and downloads is what a partner would be sent.
const printProviders = printProvidersOf(STANDARD_TYPES)
const server = createServer({ host, store, registry, renders, projects, assets, surveys, auth, mailer, authBypass, ai, printProviders,...(objects ? { objects } : {}), ...(staticDir ? { staticDir } : {}), ...(publicOrigin ? { publicOrigin } : {}), ...(appOrigin ? { appOrigin } : {}), ...(release ? { release } : {}), ...(contact ? { contact } : {}), ...(corpus ? { corpus } : {}), plans, accountPlans })
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

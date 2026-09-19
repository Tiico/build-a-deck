import { spawn, type ChildProcess } from 'node:child_process'
import { execFile } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'vite'
import { free } from './ports.js'

const run = promisify(execFile)

const HERE = import.meta.dirname
// The other packages by path rather than by import. `@byd/web` publishes no entry — it is an
// application and not a library — so there is nothing to resolve; and the server is started as a
// process here, not called as one, because what this suite is for is the product as it is
// deployed and a function call is not that.
const WEB = join(HERE, '..', '..', 'web')
const SERVER_MAIN = join(HERE, '..', '..', 'server', 'src', 'main.ts')
const OUT = join(HERE, '..', '.stack', 'web')

/** The running stack, and the one way to take it down again. */
export type Stack = {
  /** Where the whole product answers: the web app and the API on one origin, as in production. */
  origin: string
  /** What the log is kept in. `memory` is a run that proves less, and says so. */
  store: 'postgres' | 'memory'
  /**
   * Where the built web app is on disk, for the few gates that are about the build itself rather
   * than about the page: what is in the blocking stylesheet, what the browser would have to fetch,
   * what the whole thing weighs (#95, #186). The suite builds it once either way, so a gate that
   * built its own copy would be building the same files a second time to ask about them.
   */
  webDist: string
  stop: () => Promise<void>
}

/**
 * The product, stood up the way the box stands it up (DRIFT §2).
 *
 * The web app is *built* and served by the server out of `STATIC_DIR`, on one origin, with no
 * `server=` parameter anywhere — because that is what a person gets, and the development
 * arrangement of a Vite server on one port and an API on another is a configuration nobody is
 * ever handed. It is not a pedantic difference: same-origin is what the WebSocket URLs, the
 * cookie on `/auth`, and the history-fallback for `/editor` are all built around, and each of
 * those is a thing only this arrangement can be wrong about.
 *
 * The server itself runs from source through `tsx` rather than from `dist`. The fidelity that
 * matters is the browser's — the bundle, the routing, the sockets — and compiling the server
 * first would buy a `tsc` step per run to test a translation the typechecker already gates.
 */
export async function start(): Promise<Stack> {
  const closers: (() => Promise<void>)[] = []
  const stop = async () => {
    for (const close of closers.reverse()) await close()
  }
  try {
    await build({ root: WEB, logLevel: 'silent', build: { outDir: OUT, emptyOutDir: true } })
    closers.push(async () => rmSync(OUT, { recursive: true, force: true }))

    const db = await database()
    if (db) closers.push(db.stop)

    const server = await listen({ STATIC_DIR: OUT, ...(db ? { DATABASE_URL: db.url } : {}) })
    closers.push(server.stop)
    return { origin: server.origin, store: db ? 'postgres' : 'memory', webDist: OUT, stop }
  } catch (cause) {
    await stop()
    throw cause
  }
}

/**
 * The server, listening and answering `/health`.
 *
 * `AUTH_BYPASS` is on because the alternative is a mail round trip, and what a login link proves
 * is covered where it belongs — `packages/server/test/auth.test.ts` — rather than being re-proved
 * through a browser in every journey that happens to start logged in. It is the flag the README
 * names for exactly this, and nothing outside a test ever sets it.
 *
 * A table that nobody is looking at is not swept out from under a test that is between two
 * pages, so both idle timers are pushed past any run.
 */
async function listen(env: Record<string, string>): Promise<{ origin: string; stop: () => Promise<void> }> {
  let port = await free()
  for (let attempt = 0; attempt < 8; attempt++) {
    const child = spawn('pnpm', ['exec', 'tsx', SERVER_MAIN], {
      cwd: join(HERE, '..'),
      env: { ...process.env, ...env, PORT: String(port), AUTH_BYPASS: 'true', IDLE_EVICT_MS: String(24 * 3600_000), IDLE_END_MS: String(24 * 3600_000) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const log: string[] = []
    child.stdout.on('data', (b: Buffer) => log.push(String(b)))
    child.stderr.on('data', (b: Buffer) => log.push(String(b)))

    const origin = `http://127.0.0.1:${port}`
    const stop = () => drain(child)
    if (await healthy(origin, child)) return { origin, stop }
    await stop()
    // A port in the band can still be taken — by a peer worktree's stack, which is the whole
    // reason the band is walked rather than fixed. Anything else is the server failing to start,
    // and that has to be said with its own output or it reads as a port problem for ever.
    if (!log.join('').includes('EADDRINUSE')) throw new Error(`the server did not come up on ${origin}:\n${log.join('')}`)
    port = await free(port + 1)
  }
  throw new Error('the server could not find a free port in eight tries')
}

/** True once the server answers `/health`; false if it dies or never does. */
async function healthy(origin: string, child: ChildProcess): Promise<boolean> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false
    try {
      const res = await fetch(`${origin}/health`)
      // `/health` answers for Postgres too, so a server that is up before its database is not
      // reported as ready — which is the window a first test would otherwise land in.
      if (res.ok && ((await res.json()) as { ok?: boolean }).ok === true) return true
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

/**
 * SIGTERM and then wait, because that is the shutdown the box relies on (DRIFT §3) and a suite
 * that killed its server outright would never notice if draining broke. SIGKILL is the fallback
 * for a server that will not go, so a failing run still ends.
 */
function drain(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return Promise.resolve()
  return new Promise((resolve) => {
    const giveUp = setTimeout(() => child.kill('SIGKILL'), 10_000)
    child.once('exit', () => {
      clearTimeout(giveUp)
      resolve()
    })
    child.kill('SIGTERM')
  })
}

/**
 * The log's home for this run.
 *
 * `DATABASE_URL` is honoured when it is set, which is what CI does. Without it a throwaway
 * container is started, named after this process so two runs on one machine never share one, and
 * removed when the run ends — the same shape the peer sessions' `byd-gate-*` containers have.
 *
 * Without Docker the run falls back to the memory store, and `test/store.spec.ts` is what stops
 * that from being a silent downgrade: it fails wherever a run is expected to prove durability.
 * A suite that quietly proves less than it says is the failure mode this repo has already been
 * bitten by once (`pnpm test` dropping fifteen Postgres tests and still reporting green).
 */
async function database(): Promise<{ url: string; stop: () => Promise<void> } | null> {
  const given = process.env['DATABASE_URL']
  if (given) return { url: given, stop: async () => undefined }
  try {
    await run('docker', ['info'])
  } catch {
    return null
  }
  const name = `byd-e2e-${process.pid}`
  const port = await free()
  await run('docker', ['run', '-d', '--rm', '--name', name, '-e', 'POSTGRES_PASSWORD=byd', '-e', 'POSTGRES_USER=byd', '-e', 'POSTGRES_DB=byd', '-p', `127.0.0.1:${port}:5432`, 'postgres:17-alpine'])
  const stop = async () => {
    await run('docker', ['rm', '-f', name]).catch(() => undefined)
  }
  try {
    const deadline = Date.now() + 60_000
    for (;;) {
      try {
        await run('docker', ['exec', name, 'pg_isready', '-U', 'byd', '-d', 'byd'])
        break
      } catch (cause) {
        if (Date.now() > deadline) throw cause
        await new Promise((r) => setTimeout(r, 250))
      }
    }
  } catch (cause) {
    await stop()
    throw cause
  }
  return { url: `postgres://byd:byd@127.0.0.1:${port}/byd`, stop }
}

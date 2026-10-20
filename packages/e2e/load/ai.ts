import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { parseArgs, promisify } from 'node:util'
import { fakeAiProvider } from '../../../test-support/fake-ai-provider.js'
import { largeDoc } from '../../server/scripts/large-deck.js'
import { free } from '../support/ports.js'

/**
 * What the editor's AI questions cost the box (#1007, DRIFT §1): the app process's memory and the
 * bytes it sends upstream, for one question about a deck of 308 cards and for as many at once as
 * the server's total cap lets run.
 *
 *   pnpm --filter @byd/e2e load:ai [--concurrent 1,8] [--pace-ms 1500]
 *
 * The server is started from source the way the app container starts it, against `DATABASE_URL`
 * when it is set and its memory store otherwise, and the provider is the suites' fake in this
 * process, with a word every `pace-ms` so an answer holds its line for as long as a real one does
 * (a dozen words at 1.5 s is some twenty seconds). Each designer has her own account, key and
 * 308-card game, as eight designers at once would; the questions of a scenario are asked at the
 * same moment. The app's resident memory is read ten times a second throughout: idle after every
 * game has been asked about once, and its peak while the scenario's answers are running. The
 * upstream bytes are what the fake provider was sent, request by request.
 *
 * It is not part of `pnpm test`: it holds the machine for a minute and talks to no real provider.
 * What it prints is what goes into DRIFT §1.
 */
const run = promisify(execFile)
const { values: args } = parseArgs({ options: { concurrent: { type: 'string', default: '1,8' }, 'pace-ms': { type: 'string', default: '1500' } } })
const scenarios = (args.concurrent ?? '1,8').split(',').map(Number)
const designers = Math.max(...scenarios)
const MiB = 2 ** 20
const SERVER_MAIN = join(import.meta.dirname, '..', '..', 'server', 'src', 'main.ts')
const KEY = 'sk-ant-api03-good-loadNotARealKey-0123456789abcdefLOAD'
const say = (line: string) => console.log(`${new Date().toISOString().slice(11, 19)} ${line}`)
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The fake provider, counting what each request brought it.
const fake = fakeAiProvider()
fake.pace = Number(args['pace-ms'])
const received: number[] = []
const provider = createServer((req, res) => {
  if (req.method === 'POST') {
    let bytes = 0
    req.on('data', (chunk: Buffer) => (bytes += chunk.length))
    req.on('end', () => received.push(bytes))
  }
  fake.listener(req, res)
})
const providerPort = await free()
await new Promise<void>((resolve) => provider.listen(providerPort, '127.0.0.1', resolve))

const port = await free(providerPort + 1)
const origin = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['--import', 'tsx', SERVER_MAIN], {
  cwd: join(import.meta.dirname, '..'),
  env: {
    ...process.env,
    PORT: String(port),
    PUBLIC_ORIGIN: origin,
    AUTH_BYPASS: 'true',
    AI_KEY_SECRET: randomBytes(32).toString('base64'),
    AI_ANTHROPIC_URL: `http://127.0.0.1:${providerPort}/anthropic`,
    AI_OPENAI_URL: `http://127.0.0.1:${providerPort}/openai`,
  },
  stdio: ['ignore', 'ignore', 'inherit'],
})
const stop = async () => {
  child.kill('SIGTERM')
  provider.closeAllConnections()
  provider.close()
}

try {
  for (let i = 0; ; i++) {
    if ((await fetch(`${origin}/health`).catch(() => null))?.ok) break
    if (i > 300) throw new Error('the server did not come up')
    await pause(100)
  }
  say(`server ${child.pid} on ${origin}, ${process.env['DATABASE_URL'] ? 'Postgres' : 'memory store'}, a word every ${fake.pace} ms`)

  // The app's resident memory, read off the process the way `docker stats` reads the container
  // it is the only process of.
  const rss = async () => Number((await run('ps', ['-o', 'rss=', '-p', String(child.pid)])).stdout.trim()) * 1024
  let peak = 0
  let sampling = true
  const sampler = (async () => {
    while (sampling) {
      peak = Math.max(peak, await rss())
      await pause(100)
    }
  })()

  // Every designer logged in, with her key and her game.
  const doc = largeDoc()
  const people = await Promise.all(
    Array.from({ length: designers }, async (_, i) => {
      const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `load-ai-${i}-${process.pid}@example.com` }) })
      const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
      const headers = { cookie, 'content-type': 'application/json' }
      const saved = await fetch(`${origin}/me/ai-key`, { method: 'PUT', headers, body: JSON.stringify({ provider: 'anthropic', key: KEY }) })
      if (!saved.ok) throw new Error(`the key was not saved: ${saved.status}`)
      const made = await fetch(`${origin}/projects`, { method: 'POST', headers, body: JSON.stringify({ ...doc, name: `Saloonen ${i + 1}` }) })
      if (made.status !== 201) throw new Error(`the game was not made: ${made.status} ${await made.text()}`)
      return { headers, project: ((await made.json()) as { id: string }).id }
    }),
  )
  const ask = async (who: (typeof people)[number], question: string, selected?: string[]): Promise<{ status: number; ms: number; bytes: number }> => {
    const started = Date.now()
    const res = await fetch(`${origin}/projects/${who.project}/ai/ask`, { method: 'POST', headers: who.headers, body: JSON.stringify({ question, turns: [], lang: 'sv', ...(selected ? { selected } : {}) }) })
    const body = await res.text()
    return { status: res.status, ms: Date.now() - started, bytes: Buffer.byteLength(body) }
  }

  // Every game asked about once, quickly, so each is read and its context built before the idle
  // reading: what the scenarios measure is the answers, not the first opening of a game.
  fake.pace = 1
  for (const who of people) await ask(who, 'Vad heter spelet?')
  fake.pace = Number(args['pace-ms'])
  await pause(3000)

  // Then each scenario, and last the heaviest question there is: every card of the deck selected,
  // so each goes whole with the question beside the summarised game.
  const every = doc.rows.map((row) => row.id)
  for (const [n, selected] of [...scenarios.map((n) => [n, undefined] as const), [designers, every] as const]) {
    await pause(2000)
    const idle = await rss()
    peak = idle
    received.length = 0
    const answers = await Promise.all(people.slice(0, n).map((who) => ask(who, 'Vilka kort är dyrast?', selected)))
    const upstream = received.reduce((a, b) => a + b, 0)
    say(`${n} at once${selected ? ', every card selected' : ''}: ${answers.map((a) => a.status).join(' ')} in ${Math.max(...answers.map((a) => a.ms))} ms`)
    say(`  app resident memory: idle ${(idle / MiB).toFixed(1)} MiB, peak ${(peak / MiB).toFixed(1)} MiB, +${((peak - idle) / MiB).toFixed(1)} MiB`)
    say(`  upstream: ${received.length} requests, ${(upstream / 1024).toFixed(1)} KiB in all, ${(upstream / Math.max(1, received.length) / 1024).toFixed(1)} KiB each`)
  }
  sampling = false
  await sampler
} finally {
  await stop()
}

import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listenInBand } from './fixture.js'

// The tiers as the box's process reads them (#1193, #1192), held as `main.ts` starts and not as a
// fixture does: without `BYD_PLANS` the app starts and says that nothing is limited, and with one it
// cannot read it does not start at all, and its log says why. In memory, so no database is touched;
// what a tier an account has does to the start is asked of `plansAtStart` against both stores in
// `account-plans.test.ts`.
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url))

// A port out of this worker's slice, let go again for the process to take.
async function aPort(): Promise<number> {
  const probe = createServer()
  const port = await listenInBand(probe)
  await new Promise((resolve) => probe.close(resolve))
  return port
}

// The process until it says it listens or until it exits, whichever comes first, and what it wrote.
async function boot(plans: string | undefined): Promise<{ code: number | null; lines: Record<string, unknown>[] }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), PORT: String(await aPort()) }
  delete env['DATABASE_URL']
  delete env['BYD_PLANS']
  if (plans !== undefined) env['BYD_PLANS'] = plans
  const child = spawn(process.execPath, ['--import', 'tsx', MAIN], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (b: Buffer) => (out += String(b)))
  child.stderr.on('data', (b: Buffer) => (out += String(b)))
  const code = await new Promise<number | null>((resolve) => {
    child.on('exit', (c) => resolve(c))
    const listening = setInterval(() => {
      if (!out.includes('"msg":"listening"')) return
      clearInterval(listening)
      child.kill('SIGTERM')
    }, 50)
    child.on('exit', () => clearInterval(listening))
  })
  const lines = out
    .split('\n')
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
  return { code, lines }
}

describe('the tiers at start (#1193)', () => {
  it('without BYD_PLANS, starts and says no ceiling is set', async () => {
    const { lines } = await boot(undefined)
    expect(lines).toContainEqual({ msg: 'plans', plans: ['free'], default: 'free', limited: false, warning: 'no ceiling is set; nothing is limited' })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
  })

  it('with a BYD_PLANS that sets a ceiling, starts and says so', async () => {
    const { lines } = await boot(JSON.stringify({ default: 'free', plans: { free: { projects: 3 }, pro: {} } }))
    expect(lines).toContainEqual({ msg: 'plans', plans: ['free', 'pro'], default: 'free', limited: true })
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(true)
  })

  it.each([
    ['is not JSON', '{default: free', /BYD_PLANS is not JSON/],
    ['does not hold the schema', JSON.stringify({ default: 'free', plans: { free: { projekts: 3 } } }), /BYD_PLANS does not hold: .*projekts/],
  ])('with a BYD_PLANS that %s, does not start, and the log says why', async (_what, raw, why) => {
    const { code, lines } = await boot(raw)
    expect(code).not.toBe(0)
    expect(lines.some((l) => l['msg'] === 'listening')).toBe(false)
    const said = lines.find((l) => l['msg'] === 'plans')
    expect(String(said?.['error'])).toMatch(why)
  })
})

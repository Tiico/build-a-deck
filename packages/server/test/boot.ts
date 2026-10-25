import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { listenInBand } from './fixture.js'

// `main.ts` as the box starts it, in memory: what its log says until it listens or exits.
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url))

// A port out of this worker's slice, let go again for the process to take.
async function aPort(): Promise<number> {
  const probe = createServer()
  const port = await listenInBand(probe)
  await new Promise((resolve) => probe.close(resolve))
  return port
}

// The process until it says it listens or until it exits, whichever comes first, and what it wrote.
// `set` is laid over the environment the run has, without its database and its tiers.
export async function bootMain(set: Record<string, string> = {}): Promise<{ code: number | null; lines: Record<string, unknown>[] }> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), PORT: String(await aPort()) }
  delete env['DATABASE_URL']
  delete env['BYD_PLANS']
  Object.assign(env, set)
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

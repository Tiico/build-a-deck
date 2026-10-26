import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The table server starts without Chromium (#1426). `@byd/render/queue` is the renderer's half the
// server needs, and importing it never loads Playwright; the package's main entry also brings the
// renderer, and with it Playwright, which took 1.7–2.2 s of the 3.7 s the process spent before it
// listened. Every deploy restarts the server and waits that out, and so does the sweep test that
// starts `main.ts` (`sweep-spent.test.ts`), which ran out its fifteen seconds under load.
//
// What is asked is what the process has loaded once `main.ts` has run to its end: Playwright is
// CommonJS, so whatever imports it, however far down, leaves it in the require cache.
const MAIN = fileURLToPath(new URL('../src/main.ts', import.meta.url))

const loadedBy = async (entry: string): Promise<string[]> => {
  const env: Record<string, string> = { ...(process.env as Record<string, string>), PORT: '0' }
  delete env['DATABASE_URL']
  delete env['BYD_PLANS']
  const script = `
    await import(${JSON.stringify(entry)})
    const { createRequire } = await import('node:module')
    const loaded = Object.keys(createRequire(import.meta.url).cache).filter((k) => /[\\\\/]playwright(-core)?[\\\\/]/.test(k))
    process.stdout.write('\\n' + JSON.stringify({ msg: 'loaded', loaded }) + '\\n')
    process.exit(0)
  `
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let out = ''
  child.stdout.on('data', (b: Buffer) => (out += String(b)))
  child.stderr.on('data', (b: Buffer) => (out += String(b)))
  await new Promise((resolve) => child.on('exit', resolve))
  const line = out.split('\n').find((l) => l.startsWith('{"msg":"loaded"'))
  if (!line) throw new Error(`the process said nothing of what it loaded:\n${out}`)
  return (JSON.parse(line) as { loaded: string[] }).loaded
}

describe('the server as the box starts it (#1426)', () => {
  it('never loads Playwright', async () => {
    expect(await loadedBy(MAIN)).toEqual([])
  })

  // That the question can be answered at all: the renderer's own entry does load it.
  it('would see it if it did', async () => {
    expect((await loadedBy('@byd/render')).length).toBeGreaterThan(0)
  })
})

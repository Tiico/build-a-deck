import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

/**
 * A render worker against the stack's own database, as the box runs one beside the app (DRIFT §6).
 *
 * The suite does not run one by default: textures are the renderer's business and its own suite's,
 * and a worker racing every journey for the machine would be a variable no timeout here was
 * measured against. A journey whose answer waits on the renderer — a print file, an export — starts
 * one and stops it again. It needs the Postgres queue; a memory run has none to share, and a
 * journey that needs this is skipped there, where `store.spec.ts` already says the run proves less.
 */
export async function renderWorker(): Promise<{ stop: () => Promise<void> }> {
  const url = process.env['BYD_E2E_DATABASE_URL']
  if (!url) throw new Error('no database to render from: the run is on the memory store')
  const child = spawn('pnpm', ['--filter', '@byd/render', 'worker'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: url }, stdio: ['ignore', 'pipe', 'pipe'] })
  const said: string[] = []
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`the render worker did not start:\n${said.join('')}`)), 60_000)
    const hear = (chunk: Buffer) => {
      said.push(String(chunk))
      if (said.join('').includes('"state":"ready"')) {
        clearTimeout(timer)
        resolve()
      }
    }
    child.stdout.on('data', hear)
    child.stderr.on('data', hear)
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`the render worker exited with ${code}:\n${said.join('')}`))
    })
  })
  return {
    stop: () =>
      new Promise<void>((resolve) => {
        if (child.exitCode !== null) return resolve()
        child.once('exit', () => resolve())
        child.kill('SIGTERM')
      }),
  }
}

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { takeTheMachine } from '../../../test-support/one-suite-at-a-time.js'

// The lock itself, on a lock file of the test's own so that running this does not fight for the
// real one — which this very run is holding.
let dir: string
let at: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'byd-lock-test-'))
  at = join(dir, 'held')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})
// Every duration cut to milliseconds: what is checked is the rule, not the patience.
const opts = () => ({ at, staleMs: 10_000, waitMs: 2_000, pollMs: 5, beatMs: 50 })

describe('one suite at a time on this machine', () => {
  it('makes the second wait for the first, and lets it in the moment the first is done', async () => {
    const first = await takeTheMachine(opts())
    let secondIn = false
    const second = takeTheMachine(opts()).then((release) => {
      secondIn = true
      return release
    })
    await new Promise((r) => setTimeout(r, 50))
    expect(secondIn).toBe(false)

    await first()
    await expect(second).resolves.toBeTypeOf('function')
    expect(secondIn).toBe(true)
    await (await second)()
  })

  it('takes the machine from a holder that is no longer running', async () => {
    writeFileSync(at, JSON.stringify({ pid: 999_999, at: Date.now() }))
    const release = await takeTheMachine({ ...opts(), alive: () => false })
    expect(JSON.parse(readFileSync(at, 'utf8')).pid).toBe(process.pid)
    await release()
  })

  it('takes it from a holder that has stopped saying it is alive', async () => {
    // A live process, but its heartbeat stopped: felled mid-run, or stopped at a breakpoint.
    writeFileSync(at, JSON.stringify({ pid: process.pid, at: Date.now() - 60_000 }))
    const release = await takeTheMachine({ ...opts(), staleMs: 1_000 })
    expect(JSON.parse(readFileSync(at, 'utf8')).at).toBeGreaterThan(Date.now() - 5_000)
    await release()
  })

  it('keeps saying it is alive while it holds, so a long run is never taken for a dead one', async () => {
    const release = await takeTheMachine({ ...opts(), beatMs: 20 })
    const first = JSON.parse(readFileSync(at, 'utf8')).at as number
    await new Promise((r) => setTimeout(r, 120))
    expect(JSON.parse(readFileSync(at, 'utf8')).at as number).toBeGreaterThan(first)
    await release()
  })

  it('runs anyway rather than blocking for ever when the wait runs out', async () => {
    const held = await takeTheMachine(opts())
    // The holder is alive and beating; this one simply gives up waiting and goes.
    const release = await takeTheMachine({ ...opts(), waitMs: 60 })
    expect(release).toBeTypeOf('function')
    await release()
    await held()
  })

  it('leaves no lock behind when it lets go', async () => {
    const release = await takeTheMachine(opts())
    await release()
    expect(() => readFileSync(at, 'utf8')).toThrow()
  })
})

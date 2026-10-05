// @vitest-environment jsdom
import { spawnSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { startServer, type Running } from './fixture.js'
import { bordTab } from './bord-tab.js'
import { JSDOM_TEST_BUDGET } from './budget.js'

vi.setConfig({ testTimeout: JSDOM_TEST_BUDGET })

// A wait's patience is the worker's own time, not the wall clock's (#867).
//
// `setup-new-pile` fell on a machine with a load of fifteen, on a branch that never touched it:
// `Unable to find an element with the text: Skogens herrar`, the editor standing on «Öppnar
// spelet…». The editor opens in 15–100 ms; nothing in it can hang there while its server answers.
// What happened is that the operating system did not run the worker for longer than the four
// seconds a `findBy` has. When it ran it again, Node took the due timers before it read the
// sockets — and the wait's deadline is a timer, while the server's answer, already written, sat
// unread on a socket. The deadline won by the order of a loop's phases, and the condition the test
// was waiting for, quite correctly, was never looked at again.
//
// Here the worker is held exactly so: stopped with SIGSTOP, for longer than a wait's patience,
// in the moment the editor has asked for its project.
const HELD_MS = 4_500

/** Stops this very process for `ms`, the way an overloaded machine does: nothing in it runs. */
function holdTheWorker(ms: number): void {
  // Synchronous on purpose: the stop lands here, in this call, and not at some later moment the
  // test would have to guess at.
  spawnSync('sh', ['-c', `kill -STOP ${process.pid}; sleep ${ms / 1000}; kill -CONT ${process.pid}`], { stdio: 'ignore' })
}

let run: Running
beforeEach(async () => {
  run = await startServer()
})
afterEach(async () => {
  await run.stop()
})

describe('a wait whose worker was held by the machine (#867)', () => {
  it('still sees the editor open once the worker runs again', async () => {
    const realFetch = globalThis.fetch
    let held = 0
    globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
      const asked = realFetch(...args)
      if (held === 0 && String(args[0]).includes('/projects/')) {
        held = performance.now()
        holdTheWorker(HELD_MS)
        held = performance.now() - held
      }
      return asked
    }) as typeof fetch
    let close: (() => void) | undefined
    try {
      close = await bordTab(run, null)
    } finally {
      globalThis.fetch = realFetch
      close?.()
    }
    // Non-vacuity: the worker really was held past a wait's patience, inside the editor's opening.
    expect(held).toBeGreaterThan(4_000)
  })

  it('still fails a wait for something that never comes', async () => {
    const started = performance.now()
    await expect(waitFor(() => expect(document.querySelector('[data-never]')).not.toBeNull())).rejects.toThrow()
    // Inside the patience it always had, and nowhere near the test's budget.
    expect(performance.now() - started).toBeLessThan(JSDOM_TEST_BUDGET / 2)
  })

  it('still fails it when the worker was held in the middle of it', async () => {
    const started = performance.now()
    setTimeout(() => holdTheWorker(HELD_MS), 100)
    await expect(screen.findByText('aldrig här')).rejects.toThrow(/aldrig här/)
    expect(performance.now() - started).toBeLessThan(JSDOM_TEST_BUDGET - 2_000)
  })
})

import { expect, it } from 'vitest'
import { holdWorker } from '../../../../test-support/own-time.js'
import { FIXTURE_BUDGET, FIXTURE_CEILING } from './numbers.js'

// What `own-time.test.ts` watches, written once and run in both environments the packages here
// run their suites in.
export function cases(): void {
  it('held by the machine past its budget', () => {
    const started = performance.now()
    holdWorker(FIXTURE_BUDGET + 600)
    // Non-vacuity: the wall clock really did pass the budget, which is what a deadline in wall
    // clock would have failed it for.
    expect(performance.now() - started).toBeGreaterThan(FIXTURE_BUDGET)
  })

  it('waits for something that never comes', async () => {
    await new Promise(() => undefined)
  })

  it('spends its own time past its budget without letting a timer run', () => {
    // Counted in CPU rather than in wall clock, so that a busy machine cannot make it spend less.
    const from = process.cpuUsage()
    for (;;) {
      const used = process.cpuUsage(from)
      if ((used.user + used.system) / 1000 > FIXTURE_BUDGET + 400) break
    }
  })

  it('held by the machine past the ceiling', () => {
    holdWorker(FIXTURE_CEILING + 500)
  })

  it('names a wall-clock timeout of its own', () => {
    holdWorker(800)
  }, 400)
}

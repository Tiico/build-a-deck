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
    // Own time is the wall clock less the stretches in which the process spent no CPU. Neither
    // clock alone carries this loop past the mark: on a busy machine the wall clock runs while the
    // loop is not run, and that is held time; and the process's CPU counts the collector's helper
    // threads too, which on CI's runners spent a tenth of a second beside it and stopped it at
    // 0.9 s of its own. Past the mark on both, there is no stretch left that could be held time.
    const mark = FIXTURE_BUDGET + 400
    const started = performance.now()
    const from = process.cpuUsage()
    for (;;) {
      const used = process.cpuUsage(from)
      if ((used.user + used.system) / 1000 > mark && performance.now() - started > mark) break
    }
  })

  it('held by the machine past the ceiling', () => {
    holdWorker(FIXTURE_CEILING + 500)
  })

  it('names a wall-clock timeout of its own', () => {
    holdWorker(800)
  }, 400)
}

import { beforeEach } from 'vitest'
import { getFn, setFn } from 'vitest/suite'
import { ownTime, overBudget, TEST_CEILING, watchHolds, withAccount } from './own-time.js'

// The guard that holds a test to its budget in the worker's own time (#848). `own-time.ts` says
// why, and holds the measurement; this is the part that has to run inside a vitest worker.
//
// vitest's `testTimeout` is fixed into a test's body when the test is collected, so it cannot be
// taught another clock. What can be changed is the body itself: before each test, after its own
// `beforeEach` hooks, the guard wraps it, and the wrapper fails the test the moment its own time
// passes the budget — at once for a test that is waiting, since a waiting worker still runs its
// timers, and as it ends for one that never let a timer run. The body vitest gave the test is put
// back afterwards, so a retry is wrapped once and not twice.
//
// A test that names a timeout of its own (`it(…, 60_000)`) is not on the package's budget and is
// left to vitest's wall clock, as it asked. Only a test whose timeout is the ceiling is the guard's.
// `packages/server/test/own-time.test.ts` watches every one of these outcomes.

// vitest's own timeout, which in a package held to own time is the ceiling's.
const isCeiling = (error: unknown): error is Error => error instanceof Error && /^Test timed out in \d+ms\./.test(error.message)

let held: number | null = null

/** The own-time budget this package's setup file holds its tests to, or null when it holds none. */
export const ownTimeBudget = (): number | null => held

/**
 * Holds every test in the package to `budget` milliseconds of the worker's own time. Called once,
 * from the package's setup file, in a package whose config sets `testTimeout` to `ceiling`.
 */
export function holdTestsToOwnTime(budget: number, ceiling: number = TEST_CEILING): void {
  if (!(budget > 0 && budget < ceiling)) throw new Error(`an own-time budget of ${budget} ms has to lie between nothing and the ceiling of ${ceiling} ms`)
  held = budget
  beforeEach(({ task }) => {
    if (task.timeout !== ceiling) return
    const body = getFn(task)
    setFn(task, () => inOwnTime(body, budget))
    return () => setFn(task, body)
  })
}

function inOwnTime(body: () => unknown, budget: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    const settle = (outcome: { error: unknown } | null) => {
      if (settled) return
      settled = true
      watch.stop()
      if (outcome) reject(outcome.error)
      else resolve()
    }
    const watch = watchHolds((account) => {
      if (ownTime(account) > budget) settle({ error: overBudget(account, budget) })
    })
    let ran: unknown
    try {
      ran = body()
    } catch (error) {
      settle({ error })
      return
    }
    // A test the guard has already failed goes on running, as one vitest has timed out does; its
    // end, when it comes, is let go here rather than left as an unhandled rejection.
    Promise.resolve(ran).then(
      () => {
        const account = watch.read()
        settle(ownTime(account) > budget ? { error: overBudget(account, budget) } : null)
      },
      (error: unknown) => settle({ error: isCeiling(error) ? withAccount(error, watch.read(), budget) : error }),
    )
  })
}

import { describe, expect, it } from 'vitest'
import { TEST_CEILING } from '../../../test-support/own-time.js'
import { ownTimeBudget } from '../../../test-support/own-time-guard.js'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'

// This package has a member of the Postgres class (`store-postgres.test.ts`), so it holds its
// tests to that class's budget in the worker's own time, the way `@byd/server` does (#848). The
// server's `pg-suite-budget` reads the wiring off the files; this is the run itself saying so.
describe('@byd/render’s tests', () => {
  it('run on the ceiling, held to the Postgres budget in their own time', ({ task }) => {
    expect(task.timeout, 'vitest.config.ts gives vitest the ceiling, and the budget is the guard’s').toBe(TEST_CEILING)
    expect(ownTimeBudget(), 'test/setup.ts holds every test to the budget in the worker’s own time').toBe(PG_TEST_BUDGET)
  })
})

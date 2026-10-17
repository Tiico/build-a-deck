import { holdTestsToOwnTime } from '../../../test-support/own-time-guard.js'
import { PG_TEST_BUDGET } from '../../../test-support/pg-budget.js'

// Every test in the package is held to its budget in the worker's own time (#848): fifteen
// seconds of the time the worker actually ran, under a ceiling vitest is given in
// `vitest.config.ts`. `test-support/pg-budget.ts` says why fifteen, and
// `test-support/own-time.ts` why own time.
holdTestsToOwnTime(PG_TEST_BUDGET)

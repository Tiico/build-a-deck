import { defineConfig } from 'vitest/config'
import { reporting } from '../../test-support/report.js'
import { TEST_CEILING } from '../../test-support/own-time.js'

// One test run at a time on this machine, whoever started it. This package launches Chromium —
// a card, a booklet, a print sheet — and the machine is shared with every other worktree on it.
// `test-support/one-suite-at-a-time.ts` has what was measured and why the answer is not a larger
// budget.
// And the run leaves its own account on disk beside the one it prints, so a failure survives
// whatever anyone pipes the output through (#111). `test-support/report.ts` has what went
// missing twice.
// vitest's own timeout is a ceiling and not the budget (#848): `test/setup.ts` holds every test
// to `PG_TEST_BUDGET` of the worker's own time, which a machine that stops running the worker
// cannot spend for it. `test-support/own-time.ts` has what was measured.
// The worker screens with the box classifier (#1273), whose models the run fetches first, once per
// machine (`test-support/screening-models.ts`).
export default defineConfig({
  test: { testTimeout: TEST_CEILING, setupFiles: ['./test/setup.ts'], globalSetup: ['../../test-support/one-suite-at-a-time.ts', '../../test-support/screening-models.ts'], ...reporting() },
})

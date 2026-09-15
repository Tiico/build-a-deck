import { defineConfig } from 'vitest/config'
import { reporting } from '../../test-support/report.js'

// One test run at a time on this machine, whoever started it. This package launches Chromium —
// a card, a booklet, a print sheet — and the machine is shared with every other worktree on it.
// `test-support/one-suite-at-a-time.ts` has what was measured and why the answer is not a larger
// budget.
// And the run leaves its own account on disk beside the one it prints, so a failure survives
// whatever anyone pipes the output through (#111). `test-support/report.ts` has what went
// missing twice.
export default defineConfig({
  test: { globalSetup: ['../../test-support/one-suite-at-a-time.ts'], ...reporting() },
})

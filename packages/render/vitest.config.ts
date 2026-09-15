import { defineConfig } from 'vitest/config'

// One test run at a time on this machine, whoever started it. This package launches Chromium —
// a card, a booklet, a print sheet — and the machine is shared with every other worktree on it.
// `test-support/one-suite-at-a-time.ts` has what was measured and why the answer is not a larger
// budget.
export default defineConfig({
  test: { globalSetup: ['../../test-support/one-suite-at-a-time.ts'] },
})

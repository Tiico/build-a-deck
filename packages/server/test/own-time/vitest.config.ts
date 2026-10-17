import { defineConfig } from 'vitest/config'
import { FIXTURE_CEILING } from './numbers.js'

// A package held to own time, in miniature: the same guard and the same shape of config as the
// real ones, with numbers small enough that `own-time.test.ts` can watch every outcome in seconds.
// It takes no machine lock, because the run it is started from already holds it, and writes no
// report on disk, because the package's own report is beside it.
//
// The setup file is not called `setup.ts`: vitest looks a relative setup file up from the root's
// parent first, and found the server's own `test/setup.ts` there — the real budget under a fixture
// that was meant to have a small one.
export default defineConfig({
  root: import.meta.dirname,
  test: { include: ['*.fixture.ts'], testTimeout: FIXTURE_CEILING, setupFiles: ['./guard.setup.ts'] },
})

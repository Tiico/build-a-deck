import { defineConfig } from 'vitest/config'
import { reporting } from '../../test-support/report.js'
import { TEST_CEILING } from '../../test-support/own-time.js'

// The run leaves its own account on disk beside the one it prints, so a failure survives
// whatever anyone pipes the output through (#111). This package runs no browser, so it takes no
// machine lock. It does load the box classifier's models (#1273), which the global setup fetches
// once per machine into the user's cache, as the render image's build does. A picture through
// both models is a second or two of one core, more on a busy machine, so a test may take the
// repo's ceiling.
export default defineConfig({
  test: { testTimeout: TEST_CEILING, globalSetup: ['../../test-support/screening-models.ts'], ...reporting() },
})

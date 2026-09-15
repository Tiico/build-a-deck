import { defineConfig } from 'vitest/config'
import { reporting } from '../../test-support/report.js'

// The run leaves its own account on disk beside the one it prints, so a failure survives
// whatever anyone pipes the output through (#111). `test-support/report.ts` has what went
// missing twice. This package runs no browser, so it takes no machine lock.
export default defineConfig({
  test: { ...reporting() },
})

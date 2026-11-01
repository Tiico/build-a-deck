import { chromium } from '@playwright/test'
import { BROWSERS } from '../../../test-support/playwright-browsers.js'
import { expect, test } from '../support/test.js'

// The journeys' Chromium is the repo's own (#1508), not the one in the cache every project on the
// machine shares. `packages/server/test/playwright-browsers.test.ts` has why.
test("the E2E suite's Chromium is looked for in the repo's own cache (#1508)", () => {
  expect(chromium.executablePath().startsWith(`${BROWSERS}/`)).toBe(true)
})

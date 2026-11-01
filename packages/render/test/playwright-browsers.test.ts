import { describe, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { BROWSERS } from '../../../test-support/playwright-browsers.js'

// The renderer's Chromium is the repo's own (#1508), not the one in the cache every project on the
// machine shares. `packages/server/test/playwright-browsers.test.ts` has why.
describe("the renderer's Chromium in the tests (#1508)", () => {
  it("is looked for in the repo's own cache", () => {
    expect(chromium.executablePath().startsWith(`${BROWSERS}/`)).toBe(true)
  })
})

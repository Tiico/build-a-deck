import { expect, test } from '@playwright/test'
import { logIn } from '../../support/api.js'

// The guided start on a desk (#476, beslut 2026-09-27, variant B): the whole page scrolled, so at
// 1024 × 768 the frame picker in step 2 was under the fold and the live card had scrolled out of
// view by the time a frame could be chosen. The page now stands still — the head where it is, and
// each column scrolling on its own — so the card is whole while the frame is picked.
for (const [width, height] of [[1024, 768], [1280, 800]] as const) {
  test.describe(`the guided start at ${width} × ${height}`, () => {
    test.use({ viewport: { width, height }, locale: 'sv-SE' })

    test('keeps the whole card in view while a frame is picked, and never scrolls the page', async ({ page }) => {
      await logIn(page.request)
      await page.goto('/new')
      await page.getByLabel('Spelets namn').waitFor()
      const frame = page.getByRole('button', { name: 'Minimal' })
      await frame.scrollIntoViewIfNeeded()
      await expect(frame).toBeInViewport({ ratio: 1 })
      await frame.click()

      const card = page.locator('.byd-wizard-preview [data-card]').first()
      await expect(card).toBeInViewport({ ratio: 1 })
      expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0)
      expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(0)
    })
  })
}

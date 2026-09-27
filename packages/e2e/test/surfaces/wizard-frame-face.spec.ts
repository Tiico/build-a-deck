import { expect, test } from '@playwright/test'
import { logIn } from '../../support/api.js'

// The wizard's preview in the frame's own face (#476, beslut 2026-09-27): the catalogue is asked
// when a frame is pressed and not before (L27), and then the face is one the page actually loads.
// Google is answered here rather than reached, as in `font-catalog.spec.ts`.
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('loads the pressed frame s face into the page, and asks for none before', async ({ page }) => {
  const asked: string[] = []
  await page.route(GOOGLE, async (route) => {
    const url = route.request().url()
    asked.push(url)
    await (url.includes('googleapis.com')
      ? route.fulfill({ status: 200, contentType: 'text/css', body: "/* latin */\n@font-face { font-family: 'Inter'; src: url(https://fonts.gstatic.com/s/inter/latin.woff2) format('woff2'); }\n" })
      : route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.from([119, 79, 70, 50, 0, 1, 0, 0]) }))
  })
  await logIn(page.request)
  await page.goto('/new', { waitUntil: 'load' })
  await expect(page.getByText('Ramens typsnitt hämtas när du väljer ram.')).toBeVisible()
  expect(asked).toEqual([])

  await page.getByRole('button', { name: 'Minimal' }).click()
  await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Inter'))).toBe(true)
  await expect(page.getByText('Ramens typsnitt hämtas när du väljer ram.')).toHaveCount(0)
})

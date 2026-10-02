import { expect, test } from '@playwright/test'
import { logIn } from '../../support/api.js'

// The wizard's preview in the theme's own faces (#476, beslut 2026-09-27; «Utseende», L57, #633):
// the catalogue is asked when a theme is pressed and not before (L27) — a frame pressed asks for
// nothing, since a frame carries no face any more — and then the faces are ones the page actually
// loads. Google is answered here rather than reached, as in `font-catalog.spec.ts`.
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('loads the pressed theme s faces into the page, and asks for none before', async ({ page }) => {
  const asked: string[] = []
  await page.route(GOOGLE, async (route) => {
    const url = route.request().url()
    asked.push(url)
    if (!url.includes('googleapis.com')) return route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.from([119, 79, 70, 50, 0, 1, 0, 0]) })
    const family = new URL(url).searchParams.get('family')?.split(':')[0] ?? ''
    const slug = family.toLowerCase().replace(/ /g, '-')
    return route.fulfill({ status: 200, contentType: 'text/css', body: `/* latin */\n@font-face { font-family: '${family}'; src: url(https://fonts.gstatic.com/s/${slug}/latin.woff2) format('woff2'); }\n` })
  })
  await logIn(page.request)
  await page.goto('/new', { waitUntil: 'load' })
  await expect(page.getByText('Temats typsnitt hämtas när du väljer tema.')).toBeVisible()
  await page.getByRole('button', { name: 'Minimal' }).click()
  expect(asked).toEqual([])

  await page.getByRole('button', { name: 'Välj temat Retro' }).click()
  const loaded = (family: string) => page.evaluate((name) => [...document.fonts].some((f) => f.family.replace(/"/g, '') === name), family)
  await expect.poll(() => loaded('Oswald')).toBe(true)
  await expect.poll(() => loaded('Roboto Condensed')).toBe(true)
  await expect(page.getByText('Temats typsnitt hämtas när du väljer tema.')).toHaveCount(0)
})

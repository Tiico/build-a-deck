import type { Page } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'
import { expect, test } from '../support/test.js'

// A column in Tabell pulled wider with a finger (#564, L12 with the tablet addendum of 2026-09-29).
// With a mouse the edge at a heading's right made the column wider; with a finger nothing happened:
// the edge had no `touch-action`, so the browser took the gesture, sent `pointercancel`, and the
// pull was taken back as #142 says it must be. Driven with real touch points through the DevTools
// protocol, because that is the one input that makes the browser pan and cancel the way a finger
// does — a mouse drag would pass either way.
test.use({ viewport: { width: 1280, height: 740 }, hasTouch: true })

async function drag(page: Page, from: { x: number; y: number }, dx: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (dx * step) / 12, from.y) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('a finger pulls a column in Tabell wider, and the width is held when it lifts', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', players: 2, cards: 6 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').tap()

  const head = page.locator('thead th[data-col="body"]')
  await expect(head).toBeVisible()
  const grip = head.locator('.byd-data-pull')
  const before = (await head.boundingBox())!
  const edge = (await grip.boundingBox())!

  // The grip is seen without a hover, which a hand holding a tablet never makes, and its hit area
  // is a finger's (44 px) at a coarse pointer.
  expect(await grip.evaluate((el) => getComputedStyle(el, '::after').opacity)).toBe('1')
  expect(edge.width).toBeGreaterThanOrEqual(44)

  await drag(page, { x: edge.x + edge.width / 2, y: edge.y + edge.height / 2 }, 60)
  await expect.poll(async () => Math.round((await head.boundingBox())!.width - before.width)).toBeGreaterThanOrEqual(55)
  // Held once the finger has lifted: the column's own `<col>` carries the width the table was told.
  await expect(page.locator('col[data-col="body"]')).toHaveAttribute('data-width', /^\d+$/)
})

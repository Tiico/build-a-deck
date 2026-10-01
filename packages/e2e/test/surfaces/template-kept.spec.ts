import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'
import { zoomTo } from '../../support/zoom.js'

// An element dragged off the card (#478, beslut 2026-09-27, variant A): it could be put at
// x −48,5 mm, where no pointer reaches it at any zoom. Its middle now stays on the card, a word by
// it says why it stopped, and a stage bigger than the window pans under a hand held at its edge.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

async function mall(page: import('@playwright/test').Page) {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 2 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('[data-drag="title"]')).toBeVisible()
}

test('keeps the middle of a dragged element on the card, and says so', async ({ page }) => {
  await mall(page)
  const title = page.locator('[data-drag="title"]')
  const box = (await title.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x - 600, box.y + box.height / 2, { steps: 12 })
  await expect(page.locator('.byd-drag-kept')).toHaveText('Halva elementet stannar på kortet')
  await page.mouse.up()
  await expect(page.locator('.byd-drag-kept')).toHaveCount(0)
  // Half its width over the left edge and no more: its middle stands on the card's edge.
  const card = (await page.locator('.byd-canvas-stage [data-card]').boundingBox())!
  const after = (await title.boundingBox())!
  expect(Math.abs(after.x + after.width / 2 - card.x)).toBeLessThan(3)
  await expect(page.getByRole('spinbutton', { name: 'X (mm)' })).toHaveValue(String(-53 / 2))
})

test('pans the stage under a hand held at its edge, and the element goes with it', async ({ page }) => {
  await mall(page)
  await zoomTo(page, 400)
  const stage = page.locator('.byd-canvas-stage')
  await stage.evaluate((el) => el.scrollTo(0, 0))
  const title = page.locator('[data-drag="title"]')
  await title.scrollIntoViewIfNeeded()
  const before = await stage.evaluate((el) => el.scrollLeft)
  const box = (await title.boundingBox())!
  const room = (await stage.boundingBox())!
  await page.mouse.move(box.x + 10, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(room.x + room.width - 4, box.y + 10, { steps: 10 })
  await page.waitForTimeout(600)
  const panned = await stage.evaluate((el) => el.scrollLeft)
  await page.mouse.up()
  expect(panned).toBeGreaterThan(before + 50)
  // The element went with the hand across the panned part of the card, as far as its middle may
  // go: to the card's right edge.
  await expect(page.getByRole('spinbutton', { name: 'X (mm)' })).toHaveValue(String(63 - 53 / 2))
})

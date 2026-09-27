import { expect, test } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProject, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Where the canvas zooms to (#478, L19): it grew from its top left corner, so Ctrl and the wheel
// over a small badge at the foot of the card put the badge a thousand pixels below the stage. It
// now grows around the pointer; and the band's own buttons grow it around the chosen element.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('keeps what is under the pointer under it while Ctrl and the wheel zoom in', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 2 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  const body = page.locator('[data-drag="body"]')
  await expect(body).toBeVisible()
  // From a card already bigger than the stage: while the card is smaller than the stage there is
  // nothing to scroll, and the card grows from the stage's middle as it always has.
  const zoom = page.getByRole('slider', { name: 'Förstoring i procent' })
  await zoom.fill('300')
  await page.waitForTimeout(100)
  const before = (await body.boundingBox())!
  const at = { x: before.x + before.width * 0.8, y: before.y + before.height * 0.5 }
  await page.mouse.move(at.x, at.y)
  await page.keyboard.down('Control')
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -100)
    await page.waitForTimeout(60)
  }
  await page.keyboard.up('Control')
  await page.waitForTimeout(150)
  const after = (await body.boundingBox())!
  expect(after.width, 'the card did grow').toBeGreaterThan(before.width * 1.1)
  // The same place on the element is under the pointer, give or take a pixel of rounding a step.
  expect(Math.abs(after.x + after.width * 0.8 - at.x)).toBeLessThan(5)
  expect(Math.abs(after.y + after.height * 0.5 - at.y)).toBeLessThan(5)
})

// A small badge in the card's lower right corner, which is where zooming from the top left lost it.
function withBadge(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 2 }) as unknown as ProjectDoc
  doc.template.faces['front']!.base.push({ kind: 'shape', id: 'badge', shape: 'circle', x: 52, y: 78, w: 7, h: 7, fill: '#8b2e2e' } as never)
  return doc
}

test('grows around the chosen element when the band s + is pressed', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withBadge())
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  const body = page.locator('[data-drag="badge"]')
  await body.click()
  const stage = (await page.locator('.byd-canvas-stage').boundingBox())!
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Förstora mer', exact: true }).click()
  await page.waitForTimeout(150)
  const after = (await body.boundingBox())!
  const cx = after.x + after.width / 2
  const cy = after.y + after.height / 2
  expect(cx).toBeGreaterThan(stage.x)
  expect(cx).toBeLessThan(stage.x + stage.width)
  expect(cy).toBeGreaterThan(stage.y)
  expect(cy).toBeLessThan(stage.y + stage.height)
})

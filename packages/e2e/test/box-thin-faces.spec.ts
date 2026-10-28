import type { Page } from '@playwright/test'
import { expect, test } from '../support/test.js'
import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'

// #1448: på en tunn låda var sidorna och locket låsta. Den guidade startens lek har sex kort, så
// lådan blir 4 mm djup, och den neutrala ytans text stod 3 mm in från båda kanterna av en 4 mm bred
// rygg: rutan fick en negativ bredd, och den första ändringen, som lägger den neutrala ytan i
// dokumentet, vägrades i klienten innan något skickades. Ett tecken i «Text» försvann, en form kom
// aldrig, och sidan sa ingenting. Här görs det beställaren försökte, i den byggda appen.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const errors = (page: Page): string[] => {
  const seen: string[] = []
  page.on('pageerror', (error) => seen.push(error.message))
  return seen
}

async function thinBox(page: Page): Promise<void> {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, gameDoc({ name: 'Skogens råd', cards: 6 }))
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-box').click()
  await expect(page.locator('.byd-box-net')).toBeVisible()
  await expect(page.locator('.byd-box-foot-size')).toContainText('× 4 mm')
}

const panel = (page: Page, face: string) => page.locator(`.byd-box-panel[data-face="${face}"]`)
const layers = (page: Page) => page.locator('[data-layer]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-layer')))

// #1458: på en så tunn låda skulle namnet längs ryggen bli knappt en millimeter högt, under E5:s
// textgolv, så den neutrala ryggen är bara lekens färg. Designern lägger en egen text där.
test('lägger en egen text längs ryggen på en tunn låda, och den står kvar', async ({ page }) => {
  const thrown = errors(page)
  await thinBox(page)
  await page.locator('button[data-box-face="left"]').click()
  await expect(panel(page, 'left')).toHaveAttribute('data-chosen', '')
  await expect.poll(() => layers(page)).toEqual(['ground'])
  await expect(panel(page, 'left')).not.toContainText('Skogens råd')
  await page.getByRole('button', { name: /^Text/ }).click()
  await expect.poll(() => layers(page)).toHaveLength(2)
  const words = page.getByRole('textbox', { name: 'Text' })
  await words.fill('SR')
  await expect(words).toHaveValue('SR')
  await expect(panel(page, 'left')).toContainText('SR')
  // Det landade: efter en omladdning står det kvar.
  await page.reload()
  await page.locator('#byd-editor-tab-box').click()
  await expect(panel(page, 'left')).toContainText('SR')
  expect(thrown).toEqual([])
})

test('lägger en form på locket och byter färg på en tunn låda', async ({ page }) => {
  const thrown = errors(page)
  await thinBox(page)
  await page.locator('button[data-box-face="lid"]').click()
  await expect(panel(page, 'lid')).toHaveAttribute('data-chosen', '')
  await expect.poll(() => layers(page)).toEqual(['ground'])
  await page.getByRole('button', { name: /^Form/ }).click()
  await expect.poll(() => layers(page)).toHaveLength(2)
  await page.locator('[data-layer="ground"] .byd-layer-pick').click()
  await page.locator('.byd-props-sec-head').getByRole('button', { name: /^Fyllning/ }).click()
  const colour = page.getByLabel('Fyllning', { exact: true }).and(page.locator('input'))
  await colour.fill('#aa3322')
  await expect.poll(() => panel(page, 'lid').innerHTML()).toContain('#aa3322')
  expect(thrown).toEqual([])
})

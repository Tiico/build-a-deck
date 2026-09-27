import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The property panel of a plain rectangle (#478, beslut 2026-09-27, variant A): 907 px in a
// column of 683, with all of Effekter under the fold. Folded as it opens — Layout and Form open,
// the rest saying their values in their heads — and with the game's typefaces out of it while a
// layer is chosen, it stands whole in its column at both of the editor's widths.
test.use({ locale: 'sv-SE' })

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`holds a rectangle s panel in its column at ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 2 })
    await page.goto(project.editorUrl)
    await expect(page.getByText('Skogens herrar').first()).toBeVisible()
    await page.locator('#byd-editor-tab-template').click()
    await page.locator('[data-layer="frame"] .byd-layer-pick').click()
    const panel = page.locator('.byd-canvas-props')
    await expect(panel.getByRole('heading', { name: /frame/i })).toBeVisible()
    const over = await panel.evaluate((el) => el.scrollHeight - el.clientHeight)
    expect(over, 'pixels of the panel under the fold').toBeLessThanOrEqual(0)
    // Every section is there, open or saying what it holds.
    for (const name of ['Layout', 'Form', 'Fyllning', 'Linje', 'Effekter']) await expect(panel.getByRole('region', { name })).toBeVisible()
  })
}

import type { Page } from '@playwright/test'
import { applyRecipe, recipeOf } from '@byd/server/doc'
import { expect, test } from '../../support/test.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Brädets kontroller vid 1024 × 640 (#1481, #711): i fliken Bord står brädets rad överst i Spelyta,
// och öppnad visar den storleken, vägen till fliken «Bräde» och × utan att kolumnen rullas; i fliken
// «Bräde» står bräden och lagrens verktyg i sina kolumner utan att något rullas.
async function openWithBoards(page: Page) {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Hamnstaden', players: 4, cards: 6 })
  const setup = { ...doc.setup, boards: [{ id: 'main', type: { id: 'board.square457', version: 1 }, zone: doc.setup.floor }, { id: 'spelare', type: { id: 'board.player', version: 1 }, role: 'mine' }] }
  const project = await makeProjectOf(page.request, { ...doc, setup: applyRecipe(setup, recipeOf(setup)) })
  await page.goto(`${project.editorUrl}&lang=sv`)
}

// Whether every control matching `selector` inside `within` is drawn whole in it, with nothing over
// it, and the column has not been scrolled to show it.
const whole = (within: string, selector: string) =>
  `(() => {
    const side = document.querySelector(${JSON.stringify(within)})
    const box = side.getBoundingClientRect()
    const cut = [...side.querySelectorAll(${JSON.stringify(selector)})].filter((el) => el.offsetParent !== null).filter((el) => {
      const r = el.getBoundingClientRect()
      const inside = r.top >= box.top - 0.5 && r.bottom <= Math.min(box.bottom, innerHeight) + 0.5 && r.left >= box.left - 0.5 && r.right <= box.right + 0.5
      return !inside || !el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
    }).map((el) => el.getAttribute('aria-label') || el.textContent.trim())
    return { scrolled: side.scrollTop, cut }
  })()`

test.describe('brädets kontroller vid 1024 × 640 (#1481)', () => {
  test.use({ viewport: { width: 1024, height: 640 }, locale: 'sv-SE' })

  test('står i Bords kolumn utan att den rullas', async ({ page }) => {
    await openWithBoards(page)
    await page.locator('#byd-editor-tab-tables').click()
    await expect(page.locator('.byd-setup-side')).toBeVisible()
    await page.locator('.byd-setup-side').getByRole('button', { name: /^Brädet/ }).click()
    await expect(page.getByRole('combobox', { name: 'Storlek på brädet' })).toBeVisible()
    expect(await page.evaluate(whole('.byd-setup-side', '[data-material-row^="board:main"] button, [data-material-row^="board:main"] select'))).toEqual({ scrolled: 0, cut: [] })
  })

  test('står i fliken «Bräde» utan att något rullas', async ({ page }) => {
    await openWithBoards(page)
    await page.getByRole('tab', { name: 'Bräde' }).click()
    await expect(page.getByRole('button', { name: /^Huvudbräde/ })).toBeVisible()
    expect(await page.evaluate(whole('.byd-canvas-layers', '.byd-board-list button'))).toEqual({ scrolled: 0, cut: [] })
    expect(await page.evaluate(whole('.byd-canvas-tools', 'button'))).toEqual({ scrolled: 0, cut: [] })
    // The whole board in view on its stage.
    const fits = await page.evaluate(() => {
      const stage = document.querySelector('.byd-board-stage')!.getBoundingClientRect()
      const sheet = document.querySelector('.byd-board-sheet')!.getBoundingClientRect()
      return sheet.top >= stage.top && sheet.bottom <= stage.bottom && sheet.left >= stage.left && sheet.right <= stage.right && sheet.width > 100
    })
    expect(fits).toBe(true)
  })
})

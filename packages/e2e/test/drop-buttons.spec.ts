import type { Locator, Page } from '@playwright/test'
import { expect, test } from '../support/test.js'
import { spelkortDoc } from '../../server/scripts/spelkort.js'
import { logIn, makeProjectOf, startTable } from '../support/api.js'

// A button that opens a menu under it says so while the menu stands, and a press anywhere else
// closes it (#1144, beställarens val B 2026-10-22).
//
// Before, «Uppdatera ⌄» in the header stood open through any press out in the work, the ways under
// a table's row and the template's card groups closed only when the focus moved — and a press on
// the canvas's checkerboard moves no focus — and every one of the eight pointed its chevron down
// whether it was open or not, so nothing said a second press would close it.
async function openTemplate(page: Page) {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, spelkortDoc(4))
  await startTable(page.request, project.id)
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('.byd-canvas-stage')).toBeVisible()
}

// What the button draws, read off the page: the chevron's turn and the button's pressed ground.
const drawn = (button: Locator) =>
  button.evaluate((el) => {
    const glyph = el.querySelector('[data-glyph="chevron-down"]')
    return { turned: glyph ? getComputedStyle(glyph).rotate : null, pressed: getComputedStyle(el).boxShadow.includes('inset') }
  })

// A press out in the work, on the checkerboard beside the card: the one place a press lands
// without taking the focus anywhere.
async function pressOnTheCheckerboard(page: Page) {
  const stage = (await page.locator('.byd-canvas-stage').boundingBox())!
  const at = { x: stage.x + 12, y: stage.y + stage.height - 12 }
  // The point is the work's and nothing that hangs over it, or the press proves nothing.
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.byd-canvas-stage'), at)).toBe(true)
  await page.mouse.click(at.x, at.y)
}

async function opensSaysItAndCloses(page: Page, button: Locator, menu: Locator) {
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await expect.poll(() => drawn(button)).toEqual({ turned: 'none', pressed: false })

  await button.click()
  await expect(menu).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(() => drawn(button)).toEqual({ turned: '180deg', pressed: true })

  // A second press on the same button closes it again, and the button says so.
  await button.click()
  await expect(menu).toBeHidden()
  await expect.poll(() => drawn(button)).toEqual({ turned: 'none', pressed: false })

  // And a press anywhere else closes it too.
  await button.click()
  await expect(menu).toBeVisible()
  await pressOnTheCheckerboard(page)
  await expect(menu).toBeHidden()
}

test('the header\'s table menu says it is open and closes on a press in the work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTemplate(page)
  await opensSaysItAndCloses(page, page.locator('.byd-editor-caret'), page.locator('.byd-editor-ways'))
})

test('the ways under a table\'s row say they are open and close on a press in the work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTemplate(page)
  await page.locator('.byd-editor-caret').click()
  const ways = page.locator('.byd-editor-ways .byd-tables-more')
  await expect(ways).toBeVisible()
  await opensSaysItAndCloses(page, ways, page.locator('.byd-editor-ways .byd-tables-menu'))
  // The press that closed the row's ways closed the header's menu with it: both hung over the work.
  await expect(page.locator('.byd-editor-ways')).toBeHidden()
})

test('the template\'s card groups say they are open and close on a press in the work', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTemplate(page)
  await opensSaysItAndCloses(page, page.locator('.byd-canvas-group-open'), page.locator('.byd-canvas-groups'))
})

// The ways hang in the page's top layer, fixed to the window, so nothing carries them when the row
// above their button grows: the release gate of v0.44.0 saw «laddar kort 0/92» arrive under the
// row's name while the menu stood open, and the menu stayed where the button had been, over the
// button's lower half, catching the press meant to close it (#1465).
test('the ways under a table\'s row follow their button when the row above it grows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await openTemplate(page)
  await page.locator('.byd-editor-caret').click()
  const button = page.locator('.byd-editor-ways .byd-tables-more')
  const menu = page.locator('.byd-editor-ways .byd-tables-menu')
  await button.click()
  await expect(menu).toBeVisible()
  const before = (await button.boundingBox())!

  // The row's words grow, as they do when the table starts loading its cards: no scroll and no
  // resize, only the layout moving under an open menu.
  await page.locator('.byd-editor-ways li p').first().evaluate((el: HTMLElement) => {
    el.style.paddingTop = '40px'
  })
  await expect.poll(async () => (await button.boundingBox())!.y).toBeGreaterThan(before.y + 30)

  // The menu still hangs under its button, and a press on the button is the button's.
  await expect
    .poll(async () => {
      const b = (await button.boundingBox())!
      const m = (await menu.boundingBox())!
      return m.y >= b.y + b.height
    })
    .toBe(true)
  await button.click()
  await expect(menu).toBeHidden()
})

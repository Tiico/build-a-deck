import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { spelkortDoc } from '../../server/scripts/spelkort.js'
import { logIn, makeProjectOf } from '../support/api.js'

// Undo and redo for a hand without a keyboard (#566, beslut D; L12's addition for large tablets):
// A hook back and a hook forward in the header, in every tab, named for what they take back and refused when there is
// nothing to take. What they did is said in a line at the bottom of the screen, as every
// confirmation now is, so the header keeps its buttons whole when it is said.
async function openTemplate(page: Page) {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, spelkortDoc(4))
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
}

// Every control in the header wholly on the screen and not squeezed below its own text.
const headerWhole = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.byd-editor > header :is(button, a)')]
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => {
        const r = el.getBoundingClientRect()
        return r.left < 0 || r.right > innerWidth + 0.5 || el.scrollWidth > el.clientWidth + 1
      })
      .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim()),
  )

for (const width of [1280, 1024]) {
  test(`takes a change back and forward again from the header at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await openTemplate(page)
    const undo = page.getByRole('button', { name: /^Ångra/ }).first()
    const redo = page.getByRole('button', { name: /^Gör om/ }).first()
    // Nothing to take back yet: the buttons are there, and say so.
    await expect(undo).toHaveAttribute('aria-disabled', 'true')
    await expect(redo).toHaveAttribute('aria-disabled', 'true')
    for (const b of [undo, redo]) {
      const box = (await b.boundingBox())!
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44)
    }

    await page.getByRole('button', { name: /^paper\b/ }).first().click()
    const x = page.locator('.byd-props-f input').first()
    const was = await x.inputValue()
    await x.fill('-2')
    await x.press('Enter')
    await expect(undo).toHaveAccessibleName('Ångra en ändring i mallen')
    await expect(undo).not.toHaveAttribute('aria-disabled', 'true')

    await undo.click()
    await expect(x).toHaveValue(was)
    const said = page.locator('.byd-editor-confirm')
    await expect(said).toHaveText('Tog tillbaka: en ändring i mallen')
    // At the bottom of the screen, and the header keeps every button whole while it is said.
    const box = (await said.boundingBox())!
    expect(box.y).toBeGreaterThan(800 / 2)
    expect(await headerWhole(page)).toEqual([])

    await expect(redo).toHaveAccessibleName('Gör om en ändring i mallen')
    await redo.click()
    await expect(x).toHaveValue('-2')
  })
}

test('stands in the header below the desk too, on an upright tablet', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1106 })
  await logIn(page.request)
  const project = await makeProjectOf(page.request, spelkortDoc(4))
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ångra/ }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^Gör om/ }).first()).toBeVisible()
  expect(await headerWhole(page)).toEqual([])
})

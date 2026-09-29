import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { logIn, makeProjectOf } from '../../support/api.js'

// The Bord tab's felt names a zone when it is asked about (#581, beslut B). At 1024 the felt is
// 382 px across and the names, drawn beside every zone, lay over their neighbours — seven crossings
// at eight seats in Sal's Saloon. The list beside it already names every zone, so the list is the
// legend: at rest the felt draws no zone or pile names, and pointing at a row, a family or a zone —
// or standing on one with the keyboard — lights the zone and shows its name on it.
const shownNames = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('.byd-setup-felt .byd-zone > span, .byd-setup-felt .byd-pile-name')]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden')
      .map((el) => (el.textContent ?? '').trim())
      .sort(),
  )

async function bord(page: Page, width: number) {
  await page.setViewportSize({ width, height: 768 })
  await logIn(page.request)
  const project = await makeProjectOf(page.request, spelkortDoc(8))
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
  await page.locator('#byd-editor-tab-tables').click()
  await expect(page.locator('.byd-setup-felt [data-zone-handle="market"]')).toBeAttached()
}

test.describe('the Bord tab names a zone when asked (#581)', () => {
  test.use({ locale: 'sv-SE' })

  test('draws no names at rest, and lights what the list or the felt points at', async ({ page }) => {
    await bord(page, 1024)
    expect(await shownNames(page)).toEqual([])

    await page.locator('[data-zone-row="market"]').hover()
    expect(await shownNames(page)).toEqual(["Sal's Saloon"])
    await expect(page.locator('.byd-setup-felt [data-area="market"]')).toHaveAttribute('data-lit', '')

    // A family lights every zone it holds.
    await page.locator('[data-zone-family="mine"]').hover()
    expect(await shownNames(page)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((s) => `Framför ${s}`))

    // And the felt answers the other way round: a zone pointed at on the felt says its own name.
    await page.locator('.byd-setup-felt [data-zone-handle="draw"]').hover()
    expect(await shownNames(page)).toEqual(['Kortlek'])

    // The keyboard gets the same as the mouse.
    await page.mouse.move(1, 1)
    await page.locator('.byd-setup-felt [data-zone-handle="discard"]').focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    expect(await shownNames(page)).toEqual(['Kasthög'])
  })

  test('says «Mina spel» with an arrow under 1280, and in words from 1280', async ({ page }) => {
    await bord(page, 1024)
    const home = page.getByRole('link', { name: 'Mina spel' })
    await expect(home).toBeVisible()
    expect(await home.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe('←')
    await page.setViewportSize({ width: 1280, height: 768 })
    expect(await home.evaluate((el) => (el as HTMLElement).innerText.trim())).toBe('Mina spel')
  })
})

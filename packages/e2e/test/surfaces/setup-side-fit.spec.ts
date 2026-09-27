import { expect, test, type Page } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The Bord tab's left column (#480 fynd 3, 5, 15). At 1024 its content was 298 px wide in a 260 px
// track — the counter row does not wrap and the recipe has no `min-width: 0` — so «6» stood half
// out, × and «FAST» were cut and the column scrolled sideways; ＋ Yta and ＋ Hög were cut at its
// foot. At 768 the column got no height at all and lay over the felt.
async function openBord(page: Page) {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Vänsterkolumnen', players: 6, cards: 6, counters: [{ name: 'Guld', start: 0 }, { name: 'Liv', start: 20 }] })
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-tables, [data-stage="tables"]').first().click()
  await expect(page.locator('.byd-setup-side')).toBeVisible()
}

for (const locale of ['sv-SE', 'en-GB']) {
  test.describe(`the Bord tab's left column at 1024 × 768 in ${locale}`, () => {
    test.use({ viewport: { width: 1024, height: 768 }, locale })

    test('holds its content inside its track, and every tool can be reached whole', async ({ page }) => {
      await openBord(page)
      const measured = await page.evaluate(() => {
        const side = document.querySelector('.byd-setup-side') as HTMLElement
        side.scrollTop = side.scrollHeight
        const box = side.getBoundingClientRect()
        const cut = [...side.querySelectorAll<HTMLElement>('button, input, select, .byd-setup-fast')]
          .filter((el) => el.offsetParent !== null)
          .filter((el) => {
            const r = el.getBoundingClientRect()
            return r.right > box.right + 0.5 || r.left < box.left - 0.5
          })
          .map((el) => el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName)
        const tools = [...side.querySelectorAll<HTMLElement>('.byd-setup-tools button')].map((b) => b.getBoundingClientRect())
        return { across: side.scrollWidth - side.clientWidth, cut, toolsBelow: tools.filter((r) => r.bottom > box.bottom + 0.5).length }
      })
      expect(measured.across, 'the column does not scroll sideways').toBeLessThanOrEqual(0)
      expect(measured.cut).toEqual([])
      expect(measured.toolsBelow, 'scrolled to its foot, every tool stands whole in the column').toBe(0)
    })
  })
}

test.describe("the Bord tab's left column at 768 × 1024", () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('has a height of its own and does not lie over the felt', async ({ page }) => {
    await openBord(page)
    const measured = await page.evaluate(() => {
      const side = (document.querySelector('.byd-setup-side') as HTMLElement).getBoundingClientRect()
      const felt = (document.querySelector('.byd-setup-felt') as HTMLElement).getBoundingClientRect()
      return { height: side.height, overlap: Math.max(0, Math.min(side.bottom, felt.bottom) - Math.max(side.top, felt.top)) }
    })
    expect(measured.height).toBeGreaterThan(200)
    expect(measured.overlap).toBe(0)
  })
})

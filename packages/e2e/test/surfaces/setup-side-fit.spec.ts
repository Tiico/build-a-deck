import type { Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
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
        const tools = [...side.querySelectorAll<HTMLElement>('.byd-setup-add')].map((b) => b.getBoundingClientRect())
        return { across: side.scrollWidth - side.clientWidth, cut, toolsBelow: tools.filter((r) => r.bottom > box.bottom + 0.5).length }
      })
      expect(measured.across, 'the column does not scroll sideways').toBeLessThanOrEqual(0)
      expect(measured.cut).toEqual([])
      expect(measured.toolsBelow, 'scrolled to its foot, every tool stands whole in the column').toBe(0)
    })
  })
}

// The four ways to add a zone stood last in the column, and at 1024 × 640 none of them showed
// without scrolling it, nor did anything say it scrolled (#711). Since #1403 (beslut C) the list is
// a tree and the ways to add are the ＋ on the rows of what can hold something: Spelyta's and
// «Varje plats»'s stand at the head of the column, and each menu opens in the column's flow under
// its row. Read where the column first opens, untouched: both ＋ and every line of their menus
// must be drawn whole, and what is drawn at each point must be the control itself.
async function openSaloon(page: Page) {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: "Sal's Saloon", players: 4 })
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-tables, [data-stage="tables"]').first().click()
  await expect(page.locator('.byd-setup-side')).toBeVisible()
}
const ROOTS = { 'sv-SE': ['Lägg till i Spelyta', 'Lägg till i Varje plats'], 'en-GB': ['Add to Spelyta', 'Add to Every seat'] } as const
for (const locale of ['sv-SE', 'en-GB'] as const) {
  test.describe(`the Bord tab's left column at 1024 × 640 in ${locale}`, () => {
    test.use({ viewport: { width: 1024, height: 640 }, locale })

    test('shows every way to add without being scrolled, menus included (#711)', async ({ page }) => {
      await openSaloon(page)
      for (const name of ROOTS[locale]) {
        const seen = await page.evaluate((label) => {
          const side = document.querySelector('.byd-setup-side') as HTMLElement
          const box = side.getBoundingClientRect()
          const whole = (el: HTMLElement) => {
            const r = el.getBoundingClientRect()
            const inside = r.top >= box.top - 0.5 && r.bottom <= Math.min(box.bottom, innerHeight) + 0.5
            return inside && el.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
          }
          const plus = side.querySelector<HTMLElement>(`button[aria-label="${label}"]`)
          return { scrolled: side.scrollTop, found: plus !== null, whole: plus ? whole(plus) : false }
        }, name)
        expect(seen, name).toEqual({ scrolled: 0, found: true, whole: true })
        await page.getByRole('button', { name }).click()
        const items = await page.evaluate((label) => {
          const side = document.querySelector('.byd-setup-side') as HTMLElement
          const box = side.getBoundingClientRect()
          const menu = side.querySelector<HTMLElement>(`[role="menu"][aria-label="${label}"]`)
          return {
            scrolled: side.scrollTop,
            hidden: [...(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
              .filter((b) => {
                const r = b.getBoundingClientRect()
                const inside = r.top >= box.top - 0.5 && r.bottom <= Math.min(box.bottom, innerHeight) + 0.5
                return !inside || !b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
              })
              .map((b) => b.textContent?.trim()),
            count: menu?.querySelectorAll('[role="menuitem"]').length ?? 0,
          }
        }, name)
        expect(items.count, `${name}: a menu with lines`).toBeGreaterThanOrEqual(3)
        expect(items.hidden, `${name}: every line drawn whole`).toEqual([])
        expect(items.scrolled).toBe(0)
        await page.keyboard.press('Escape')
      }
    })

    test('stands each menu under the row it adds to, before what the row holds (#711)', async ({ page }) => {
      await openBord(page)
      for (const name of ROOTS[locale]) {
        await page.getByRole('button', { name }).click()
        const placed = await page.evaluate((label) => {
          const plus = document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
          const li = plus.closest('li')!
          const row = plus.closest('.byd-setup-row')!
          const menu = li.querySelector<HTMLElement>(':scope > [role="menu"]')!
          const list = li.querySelector('ul')!
          return {
            inRow: Math.abs(plus.getBoundingClientRect().top - row.getBoundingClientRect().top) < 1,
            underRow: menu.getBoundingClientRect().top >= row.getBoundingClientRect().bottom - 0.5,
            beforeList: menu.compareDocumentPosition(list) === Node.DOCUMENT_POSITION_FOLLOWING,
          }
        }, name)
        expect(placed, name).toEqual({ inRow: true, underRow: true, beforeList: true })
        await page.keyboard.press('Escape')
      }
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

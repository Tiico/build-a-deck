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

// The four ways to add a zone stood last in the column, and at 1024 × 640 none of them showed
// without scrolling it, nor did anything say it scrolled (#711). They stand under the heading of
// the group they add to (beställarens beslut B): «＋ Yta» and «＋ Hög» under «På bordet», the two per
// seat under «Vid platserna». Read where the column first opens, untouched, and at the point of
// each button — what is drawn there must be the button itself. On the game the playtest found it
// on, four seats and one counter: a game with more counters or more zones on the table pushes the
// seat group's two further down, which is the price B was chosen at.
async function openSaloon(page: Page) {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: "Sal's Saloon", players: 4 })
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-tables, [data-stage="tables"]').first().click()
  await expect(page.locator('.byd-setup-side')).toBeVisible()
}
for (const locale of ['sv-SE', 'en-GB']) {
  test.describe(`the Bord tab's left column at 1024 × 640 in ${locale}`, () => {
    test.use({ viewport: { width: 1024, height: 640 }, locale })

    test('shows every way to add a zone without being scrolled (#711)', async ({ page }) => {
      await openSaloon(page)
      const seen = await page.evaluate(() => {
        const side = document.querySelector('.byd-setup-side') as HTMLElement
        const box = side.getBoundingClientRect()
        const buttons = [...side.querySelectorAll<HTMLElement>('.byd-setup-tools button')]
        return {
          scrolled: side.scrollTop,
          count: buttons.length,
          hidden: buttons
            .filter((b) => {
              const r = b.getBoundingClientRect()
              const inside = r.top >= box.top - 0.5 && r.bottom <= Math.min(box.bottom, innerHeight) + 0.5
              return !inside || !b.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2))
            })
            .map((b) => b.getAttribute('aria-label') ?? b.textContent?.trim()),
        }
      })
      expect(seen.scrolled).toBe(0)
      expect(seen.count).toBe(4)
      expect(seen.hidden).toEqual([])
    })

    test('stands each way to add under the group it adds to (#711)', async ({ page }) => {
      await openBord(page)
      const groups = await page.evaluate(() =>
        [...document.querySelectorAll('.byd-setup-zones > section')].map((section) => ({
          heading: section.querySelector('h2')?.textContent,
          adds: [...section.querySelectorAll('.byd-setup-tools button')].length,
          before: section.querySelector('.byd-setup-tools')?.compareDocumentPosition(section.querySelector('ul')!) === Node.DOCUMENT_POSITION_FOLLOWING,
        })),
      )
      expect(groups.map((g) => [g.adds, g.before])).toEqual([[2, true], [2, true]])
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

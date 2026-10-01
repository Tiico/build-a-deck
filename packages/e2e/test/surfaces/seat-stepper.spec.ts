import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The seat count as a stepper (#620, variant A, beställarens beslut 2026-10-01): «Spelare [−] [4]
// [+]» on one row, the number a field, the same control in Bord's recipe column and in the guided
// start. It replaced eight 44 px buttons, which wrapped onto two rows in the column (the section
// was 124 px tall) and took 445 px across the guided start.
//
// Nothing here pins a width of text: the machine's font decides those, and Linux's DejaVu is
// about 13 % wider than a Mac's. What is claimed is a relationship that holds in any font — the
// three targets share one row, each is at least 44 by 44, the row stays inside its column, and
// the section is one heading and one row tall.
const rect = (target: Locator) =>
  target.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  })

async function oneRowOfTargets(scope: Locator): Promise<{ top: number; bottom: number; left: number; right: number }> {
  const parts = [scope.getByRole('button', { name: 'En spelare färre' }), scope.getByRole('spinbutton', { name: /Antal spelare/ }), scope.getByRole('button', { name: 'En spelare fler' })]
  const boxes = await Promise.all(parts.map(rect))
  for (const box of boxes) {
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.top).toBe(boxes[0]!.top)
  }
  // In reading order, left to right: less, the number, more.
  expect(boxes[0]!.right).toBeLessThanOrEqual(boxes[1]!.left)
  expect(boxes[1]!.right).toBeLessThanOrEqual(boxes[2]!.left)
  return { top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)), left: boxes[0]!.left, right: boxes[2]!.right }
}

async function openBord(page: Page, players: number): Promise<Locator> {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', players })
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-tables').click()
  await expect(page.locator('[data-setup-editor]')).toBeVisible()
  return page.locator('.byd-setup-recipe section').filter({ has: page.locator('#byd-setup-players') })
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 1024, height: 768 }] as const) {
  test.describe(`the seat stepper at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport, locale: 'sv-SE' })

    test('is one row of 44 px targets in Bord’s recipe column, and the section is one heading and that row', async ({ page }) => {
      const section = await openBord(page, 4)
      const row = await oneRowOfTargets(section)
      const column = await rect(page.locator('.byd-setup-recipe'))
      expect(row.left).toBeGreaterThanOrEqual(column.left)
      expect(row.right).toBeLessThanOrEqual(column.right)
      // The heading row stands over the control and nothing else does: no second row of buttons.
      const heading = await rect(section.locator('.byd-help-row'))
      const box = await rect(section)
      expect(row.top).toBeGreaterThanOrEqual(heading.bottom)
      expect(box.bottom - row.bottom).toBeLessThanOrEqual(2)
      expect(box.height).toBeLessThan(heading.height + 2 * 44)
    })

    test('is the same row in the guided start', async ({ page }) => {
      await logIn(page.request)
      await page.goto('/new')
      const group = page.getByRole('group', { name: 'Spelare' })
      await expect(group).toBeVisible()
      const row = await oneRowOfTargets(group)
      // Three targets and a divider each side of the number, not eight buttons and their gaps.
      expect(row.right - row.left).toBeLessThan(8 * 44)
    })
  })
}

test.describe('the seat stepper under a keyboard', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('is reached with Tab, stepped with the arrows, and the felt follows', async ({ page }) => {
    const section = await openBord(page, 4)
    const field = section.getByRole('spinbutton', { name: /Antal spelare/ })
    // A real walk with the Tab key, so the ring drawn is the one a keyboard gets.
    for (let i = 0; i < 80 && !(await field.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(field).toBeFocused()
    // The two buttons are a pointer's; the keyboard's next stop after the number is past them.
    await page.keyboard.press('ArrowUp')
    await expect(field).toHaveValue('5')
    await expect(page.locator('[data-table] .byd-hand[data-zone="hand:E"]')).toHaveCount(1)
    // The editor draws focus inside a field, never as a ring round it.
    const ring = await field.evaluate((el) => getComputedStyle(el).boxShadow)
    expect(ring).toMatch(/inset/)
    await page.keyboard.press('Shift+Tab')
    await expect(section.getByRole('button', { name: 'En spelare fler' })).not.toBeFocused()
    await expect(section.getByRole('button', { name: 'En spelare färre' })).not.toBeFocused()
  })
})

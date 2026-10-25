import type { Page } from '@playwright/test'
import { DESK } from '../support/devices.js'
import { twoEditors } from '../support/editors.js'
import { expect, test } from '../support/test.js'

// Who has the game open is counted in people, not in tabs (D3). Ada has the game open in two tabs
// of her browser and Bo in one of his. The header said «3 online» and drew Ada twice, so a
// designer alone with two tabs looked like company, and a pair looked like a crowd. The count is said
// in the door's name, and the others hang from the header's edge (L63, #1250): in each tab the door
// is its own person's face and the stack is the other one.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

test('the same person in two tabs is one of the people online', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    const again = await page.context().newPage()
    await page.goto(game.editorUrl)
    await again.goto(game.editorUrl)
    await game.bo.goto(game.editorUrl)

    for (const p of [page, again, game.bo]) {
      const here = p.locator('[data-here]')
      await expect(here).toHaveAccessibleName(/, 2 online$/)
      await expect(here.locator('i')).toHaveCount(2)
      await expect(here.locator('.byd-editor-here-others i')).toHaveCount(1)
    }
    // Ada's second tab is listed as her first, and still draws Ada in the door and Bo on the edge.
    const face = (p: Page, where: string) => p.locator(where).evaluate((i) => i.outerHTML)
    expect(await face(again, '[data-here] > i')).toBe(await face(page, '[data-here] > i'))
    expect(await face(again, '[data-here] .byd-editor-here-others i')).toBe(await face(game.bo, '[data-here] > i'))

    // One of Ada's tabs closes, and she is still here in the other.
    await again.close()
    for (const p of [page, game.bo]) await expect(p.locator('[data-here]')).toHaveAccessibleName(/, 2 online$/)

    // Bo leaves, and Ada is alone: no count at all, and nothing hangs from the header.
    await game.bo.close()
    await expect(page.locator('[data-here]')).toHaveAccessibleName('Dela · vilka som har spelet')
    await expect(page.locator('[data-here] i')).toHaveCount(1)
    await expect(page.locator('[data-here] .byd-editor-here-others')).toHaveCount(0)
  } finally {
    await game.close()
  }
})

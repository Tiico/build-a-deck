import { DESK } from '../support/devices.js'
import { twoEditors } from '../support/editors.js'
import { expect, test } from '../support/test.js'

// Who has the game open is counted in people, not in tabs (D3). Ada has the game open in two tabs
// of her browser and Bo in one of his. The header said «3 online» and drew Ada twice, so a
// designer alone with two tabs looked like company, and a pair looked like a crowd.
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
      await expect(here.locator('b')).toHaveText('2 online')
      await expect(here.locator('i')).toHaveCount(2)
    }

    // One of Ada's tabs closes, and she is still here in the other.
    await again.close()
    for (const p of [page, game.bo]) await expect(p.locator('[data-here] b')).toHaveText('2 online')

    // Bo leaves, and Ada is alone: no count at all.
    await game.bo.close()
    await expect(page.locator('[data-here] b')).toHaveCount(0)
    await expect(page.locator('[data-here] i')).toHaveCount(1)
  } finally {
    await game.close()
  }
})

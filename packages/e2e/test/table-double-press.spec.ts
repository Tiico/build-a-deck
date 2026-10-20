import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A double press turns over what was pressed (#224, K14), and the table's own help promises it.
// It did not (#482 fynd 1): the first press opens the ring, the second lands on the ring's backdrop,
// which closed on `pointerup` and took itself away before the browser could make a click of it —
// so no `dblclick` ever reached the frame that listens for one. Only real presses in an engine
// that makes `dblclick` out of them can say whether it works; jsdom makes no such thing.
test.describe('a double press on the table screen (#482)', () => {
  test.use({ viewport: DESK.viewport })

  test('turns the card over whether it reads or not, and a single press still asks about one that does not', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 1, copies: 3 })
    const { page } = await open(DESK, `${table.tableUrl}&lang=sv`)
    const pile = page.locator('.byd-pile[data-zone="draw"]')
    await expect(pile).toHaveAttribute('data-count', '3')
    await pile.locator('.byd-pile-top').click()
    await page.getByRole('button', { name: 'Dra 1' }).click()
    const card = page.locator('.byd-card[data-component]').first()
    await expect(card).toBeVisible()
    // A card drawn at the table's own screen lands face up (#719), so it reads.
    await expect(card).toHaveAttribute('data-face', 'front')
    const box = (await card.boundingBox())!
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 }

    // A double press on a card that reads turns it: the first press lifts it, the second is the
    // double press, and nothing is left standing.
    await page.mouse.dblclick(at.x, at.y)
    await expect(card).toHaveAttribute('data-face', 'back')
    await expect(page.locator('[data-radial]')).toHaveCount(0)
    await expect(page.locator('[data-lift]')).toHaveCount(0)

    // One press is still the ring on a card with nothing to read.
    await page.mouse.click(at.x, at.y)
    await expect(page.locator('[data-radial]')).toHaveCount(1)
    await expect(page.locator('[data-lift]')).toHaveCount(0)
    await page.keyboard.press('Escape')

    // A double press on a card that does not read turns it just the same.
    await page.mouse.dblclick(at.x, at.y)
    await expect(card).toHaveAttribute('data-face', 'front')
    await expect(page.locator('[data-radial]')).toHaveCount(0)

    // And now it reads: one press lifts it (K26, #509), and the next asks.
    await page.mouse.click(at.x, at.y)
    await expect(page.locator('[data-lift]')).toHaveCount(1)
    await expect(page.locator('[data-radial]')).toHaveCount(0)
    await page.mouse.click(at.x, at.y)
    await expect(page.locator('[data-radial]')).toHaveCount(1)
  })
})

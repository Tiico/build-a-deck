import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The top of a pile dragged into an area is a card in that area (K2, #680). It went as a `split`
// with no `to`, so it came to rest as a card on the floor that only lay over the area: its label
// said «kort i Spelyta», the log said a new pile, and everything that reads a card's zone counted
// it on the floor. This is the gesture in the built app, with the pointer events a browser makes
// of a drag.
test.describe('the top of a pile let go inside an area (#680)', () => {
  test.use({ viewport: DESK.viewport })

  test('lands in that area, and says so on the card', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const { page } = await open(DESK, `${table.tableUrl}&lang=sv`)
    const top = page.locator('.byd-pile[data-zone="draw"] .byd-pile-top')
    const area = page.locator('[data-area="mine:A"]')
    await expect(top).toBeVisible()
    const from = (await top.boundingBox())!
    const to = (await area.boundingBox())!
    const name = (await area.locator('span').first().textContent())?.trim() ?? ''
    expect(name, 'the area says its name on the felt').not.toBe('')

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()

    const card = page.locator('.byd-card[data-component]')
    await expect(card).toHaveCount(1)
    await expect(card).toHaveAttribute('aria-label', new RegExp(`kort i ${name}\\.`))
  })
})

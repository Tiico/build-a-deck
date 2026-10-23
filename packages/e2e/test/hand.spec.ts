import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The card the bar names is a card the player can see (#415, #1147).
//
// The bar over the tabs names the marked card and plays it, so a marked card that lies outside
// the panel — scrolled away, or behind the bar itself — is not a cosmetic fault: it is a player
// playing a card they have never seen. A card drawn is marked as it lands at the grid's far end,
// so it is reproduced by drawing card after card, through the tile the player actually presses.
test.describe('the hand on a phone', () => {
  test('never names a marked card while it lies outside the panel', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })

    const draw = ada.page.locator('[data-zone-draw="draw"]')
    await expect(draw).toBeVisible()

    for (let held = 1; held <= 12; held++) {
      await draw.click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(held)
      // The grid is told a card is marked before anything is measured: waiting on the product
      // rather than on a number of milliseconds.
      const marked = ada.page.locator('[data-hand-card][data-selected="true"]')
      await expect(marked).toHaveCount(1)
      await expect(ada.page.locator('[data-hand-bar]')).toBeVisible()

      // The panel scrolls smoothly or not at all; the reading waits for it to stand still.
      await expect
        .poll(() =>
          ada.page.evaluate(() => {
            const panel = (document.querySelector('.byd-panels') as HTMLElement).getBoundingClientRect()
            const card = (document.querySelector('[data-hand-card][data-selected="true"]') as HTMLElement).getBoundingClientRect()
            return Math.round(Math.max(0, panel.top - card.top) + Math.max(0, card.bottom - panel.bottom))
          }),
          { message: `with ${held} in hand, the marked card lies outside the panel` },
        )
        .toBe(0)
      const name = await marked.textContent()
      expect(name?.trim(), 'the marked card has a name to be marked by').not.toBe('')
    }

    // Non-vacuity: by the twelfth card the panel really does hold more than it shows, so the
    // readings above were not twelve readings of a panel that never needed to scroll.
    const overflow = await ada.page.evaluate(() => {
      const panel = document.querySelector('.byd-panels') as HTMLElement
      return Math.round(panel.scrollHeight - panel.clientHeight)
    })
    expect(overflow, 'twelve cards overflow the phone, so scrolling was required').toBeGreaterThan(0)
  })
})

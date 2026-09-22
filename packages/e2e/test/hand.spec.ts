import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The card the phone says is chosen, on the phone the player is holding (#415).
//
// Under the strip stands `Valt: …`, and the five buttons beside it — read, play in front of me,
// discard, put underneath, play somewhere — all act on that one card. So a chosen card that has
// scrolled out of the strip is not a cosmetic fault: it is a player playing a card they have
// never seen. It was found by drawing four cards in a row, and it is reproduced here the same
// way, through the tile the player actually presses.
test.describe('the hand on a phone', () => {
  test('never says a card is chosen while it lies outside the strip', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })

    const draw = ada.page.locator('[data-zone-draw="draw"]')
    await expect(draw).toBeVisible()

    for (let held = 1; held <= 8; held++) {
      await draw.click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(held)
      // The strip is told a card is chosen before anything is measured: waiting on the product
      // rather than on a number of milliseconds.
      const chosen = ada.page.locator('[data-hand-card][data-selected="true"]')
      await expect(chosen).toHaveCount(1)

      const seen = await ada.page.evaluate(() => {
        const strip = document.querySelector('.byd-strip[data-hand]') as HTMLElement
        const card = document.querySelector('[data-hand-card][data-selected="true"]') as HTMLElement
        const s = strip.getBoundingClientRect()
        const left = s.left + strip.clientLeft
        const c = card.getBoundingClientRect()
        return {
          outside: Math.round(Math.max(0, left - c.left) + Math.max(0, c.right - (left + strip.clientWidth))),
          // What the strip would have to scroll past for the question to be real at all.
          overflow: Math.round(strip.scrollWidth - strip.clientWidth),
          name: card.textContent?.trim() ?? '',
        }
      })

      expect(seen.name, 'the chosen card has a name to be chosen by').not.toBe('')
      expect(seen.outside, `with ${held} in hand, «${seen.name}» is ${seen.outside} px outside the strip`).toBe(0)
    }

    // Non-vacuity: by the eighth card the strip really does have more cards than it can show, so
    // the eight assertions above were not eight readings of a strip that never needed to scroll.
    const overflow = await ada.page.evaluate(() => {
      const strip = document.querySelector('.byd-strip[data-hand]') as HTMLElement
      return Math.round(strip.scrollWidth - strip.clientWidth)
    })
    expect(overflow, 'eight cards overflow the phone, so scrolling was required').toBeGreaterThan(0)
  })
})

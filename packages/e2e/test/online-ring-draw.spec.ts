import { join } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// «Dra 1» on the distance view draws to the player's own hand (#746, beställarens beslut
// 2026-10-03). It laid a nameless face-down pile beside the deck and left the hand empty, and the
// last move said «… till en ny hög»: a new player took the obvious verb and got the wrong thing.
// The journey in the built app: the ring a press on the deck opens, and what the hand and the
// line under the felt say afterwards.
test.describe('the deck’s «Dra 1» on the distance view (#746)', () => {
  test.use({ viewport: DESK.viewport })

  test('draws a card to the hand and says so', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
    await expect(page.locator('[data-hand-card]')).toHaveCount(0)

    await page.locator('.byd-pile[data-zone="draw"] .byd-pile-top').click()
    await page.getByRole('button', { name: 'Dra 1', exact: true }).click()

    await expect(page.locator('[data-hand-card]')).toHaveCount(1)
    await expect(page.locator('.byd-pile[data-zone="draw"]')).toHaveAttribute('data-count', '3')
    // Said to Bo on Bo's own screen (#714); the others read «Bo drog … till Bos hand».
    await expect(page.getByRole('status').filter({ hasText: /drog 1 kort från/ })).toHaveText('Du drog 1 kort från Draghög till din hand')
  })
})

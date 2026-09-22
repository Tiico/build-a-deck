import { PHONE, TV } from '../support/devices.js'
import { cardsIn, mentions } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// What a private area says about itself on the felt (#414, decision B of 2026-09-22).
//
// The phone's primary green button is «Framför mig», and it lays the card in an area only its
// owner may look into. Three cards went in and the television drew the same empty dashed box it
// draws for a seat that has played nothing — so the table on the screen was not the table in the
// room. The count is already on the wire (`mode: count`, `n: 3`) and was being thrown away.
//
// The area says how much. It must never say what, and that half is checked where this repo
// checks hidden information: on the raw frames, not on the screen.
test.describe('a private area on the felt', () => {
  test('says how many cards lie in it, and still never says which', async ({ tableOf, player, open }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
    const tv = await open(TV, table.tvUrl)

    const mine = tv.page.locator('[data-area="mine:A"]')
    const empty = tv.page.locator('[data-area="mine:B"]')
    await expect(mine).toBeVisible()

    // Before anything is played, the two areas say the same thing — which is the state the issue
    // complains about persisting after three cards have gone in.
    await expect(mine.locator('[data-area-count]')).toHaveCount(0)

    for (let n = 1; n <= 3; n++) {
      await ada.page.locator('[data-zone-draw="draw"]').click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(1)
      await ada.page.getByRole('button', { name: 'Framför mig' }).click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(0)
      // The felt says the new number, and says it on the television without anyone asking.
      await expect(mine.locator('[data-area-count]')).toHaveText(String(n))
    }

    // An area nobody has played into is still silent: the number is a difference, not decoration.
    await expect(empty.locator('[data-area-count]')).toHaveCount(0)

    // And the other half (B6). Ada is told which cards are hers — non-vacuity, so the search
    // below is known to be able to find these words at all — and nobody else ever is.
    const hers = cardsIn(ada.wire.received(), 'mine:A')
    expect(hers, 'Ada is told which cards lie in her own area').toHaveLength(3)
    for (const card of hers) {
      expect(mentions(tv.wire.received(), card), `the big screen was sent ${card}, which lies in Ada’s private area`).toHaveLength(0)
      expect(mentions(bo.wire.received(), card), `Bo was sent ${card}, which lies in Ada’s private area`).toHaveLength(0)
    }
  })
})

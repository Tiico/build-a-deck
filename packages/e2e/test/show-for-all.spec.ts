import { PHONE, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// «Visa för alla» from a phone (#518, #508 beslut B): a card the table sees can be held up on the
// room's TV from the phone's reader, over the felt, at the size the sofa reads (K8, K26). The phone
// sends presence naming the card; the TV draws it only because its own view carries the face.
//
// The whole journey in the built app: one player lays a card in front of her, another reads it
// from the fold of the table's areas on her phone and shows it, and the television says who did.
test('a card read on one phone is held up on the television for the room', async ({ tableOf, player, open }) => {
  const table = await tableOf({ players: 2, cards: 16 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
  const tv = await open(TV, `${table.tvUrl}&lang=sv`)

  await ada.page.locator('[data-zone-draw="draw"]').click()
  await expect(ada.page.locator('[data-hand-card]')).toHaveCount(1)
  // Her hand is hers: the reader offers nothing for the room there.
  await ada.page.locator('[data-hand-card]').first().click()
  await expect(ada.page.locator('.byd-inspect')).toBeVisible()
  await expect(ada.page.locator('[data-show-all]')).toHaveCount(0)
  // Played from the reader's own second press (#507), which is where her thumb already is.
  await ada.page.locator('.byd-inspect').getByRole('button', { name: 'Framför mig' }).click()
  await expect(ada.page.locator('[data-hand-card]')).toHaveCount(0)

  await bo.page.locator('[data-phone-table] > summary').click()
  const card = bo.page.locator('[data-phone-table] [data-zone-summary="mine:A"] [data-area-card]').first()
  await card.click()
  const id = await card.getAttribute('data-area-card')
  await bo.page.locator('[data-show-all]').click()
  // Her phone speaks the browser's language; the press is said where it was made.
  await expect(bo.page.locator('[data-show-all]')).toHaveText('Shown to everyone')

  const shown = tv.page.getByRole('status', { name: /Bo visar/ })
  await expect(shown).toBeVisible()
  await expect(shown.locator(`[data-tv-show="${id}"]`)).toHaveCount(1)
})

import { withQuery } from '../support/api.js'
import { PHONE, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The phone beside the television, from the ground up (#1147, beställarens val B): a round as a
// player makes it, on the built app with a television in the room. Draw a card, play it in front
// of yourself, find it on «Framför mig», and take it back — and the television follows each step.
test.use({ locale: 'sv-SE' })

test('draws, plays in front of her, finds the card on «Framför mig» and takes it back', async ({ tableOf, player, open }) => {
  const table = await tableOf({ players: 2, cards: 12 })
  const seat = table.seats[0]!
  const ada = await player(table, { name: 'Ada', seat, device: PHONE })
  const tv = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
  const page = ada.page
  const faceUp = tv.page.locator(`.byd-card[data-component][data-face="front"]`)
  await expect(tv.page.locator(`[data-area="mine:${seat}"]`)).toBeVisible()
  const before = await faceUp.count()

  // The hand's tab is open, and nothing is marked: no bar.
  await expect(page.getByRole('tab', { name: /^Handen/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('[data-hand-bar]')).toHaveCount(0)

  // Drawn, and marked as it lands: the bar names it and offers to play it.
  await page.locator('[data-zone-draw="draw"]').tap()
  const card = page.locator('[data-hand-card]')
  await expect(card).toHaveCount(1)
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  // The card's name as it is spoken: its text also holds what a face still on its way says.
  const name = (await card.getAttribute('aria-label'))!.split(',')[0]!
  const bar = page.locator('[data-hand-bar]')
  await expect(bar.locator('strong')).toHaveText(name)
  await bar.getByRole('button', { name: 'Framför mig' }).tap()
  await expect(card).toHaveCount(0)
  await expect(page.locator('[data-hand-bar]')).toHaveCount(0)
  await expect(faceUp).toHaveCount(before + 1)

  // On «Framför mig», which counts it.
  const mine = page.getByRole('tab', { name: /^Framför mig/ })
  await expect(mine).toHaveText('Framför mig, 1')
  await mine.tap()
  await expect(page.getByRole('tabpanel')).toHaveCount(1)
  await expect(page.locator('[data-panel="mine"] [data-mine-card]')).toHaveCount(1)

  // And back: «Ångra» in the head, wherever the player is.
  await page.getByRole('button', { name: 'Ångra' }).tap()
  await expect(page.locator('[data-panel="mine"] [data-mine-card]')).toHaveCount(0)
  await expect(mine).toHaveText('Framför mig, 0')
  await expect(faceUp).toHaveCount(before)
  await page.getByRole('tab', { name: /^Handen/ }).tap()
  await expect(page.locator('[data-hand-card]')).toHaveCount(1)
})

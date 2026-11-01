import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf, withQuery } from '../support/api.js'
import { PHONE, TV } from '../support/devices.js'
import { TILE_TITLES, tileGame } from '../support/game.js'
import { expect, test } from '../support/test.js'

// Brickor i telefonen (#1486, variant A i #1474), i den byggda appen: Ada drar en bricka ur den
// dolda påsen till handen på telefonen. TV:n ser en sexhörnings baksida i hennes solfjäder och
// aldrig vilken, och när hon spelar den framför sig ligger den där i sin form på TV:n.
test.use({ locale: 'sv-SE' })

test('en bricka dras till handen på telefonen och spelas framför Ada, och TV:n ser den', async ({ request, player, open }) => {
  const doc = tileGame()
  const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const tv = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
  const page = ada.page

  // The bag on the hand's tab, counted in tiles, draws one into the hand.
  const bag = page.locator('[data-zone-draw="bag"]')
  await expect(bag).toContainText('4 brickor')
  await bag.tap()
  const tile = page.locator('[data-hand-card][data-shape="hex"]')
  await expect(tile).toHaveCount(1)
  const name = (await tile.getAttribute('aria-label'))!.split(',')[0]!
  expect(TILE_TITLES).toContain(name)

  // The television fans the back of a hexagon in Ada's hand, and nothing on it names the tile.
  await expect(tv.page.locator('.byd-hand[data-zone="hand:A"] .byd-back[data-shape="hex"]')).toHaveCount(1)
  await expect(tv.page.locator('body')).not.toContainText(name)

  // Played in front of her from the bar, it lies there on the television in its shape.
  await expect(tile).toHaveAttribute('aria-pressed', 'true')
  await page.locator('[data-hand-bar]').getByRole('button', { name: 'Framför mig' }).tap()
  await expect(tile).toHaveCount(0)
  const played = tv.page.locator('.byd-card[data-component][data-shape="hex"]')
  await expect(played).toHaveCount(1)
  await expect(played).toHaveAttribute('data-face', 'front')
  await expect(played).toContainText(name)
})

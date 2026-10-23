import { PHONE, TV } from '../support/devices.js'
import { cardsIn, mentions } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// A card turned over in the hand is played face down (#1133, beställarens beslut A — K11's second
// choice). Ada turns a card on her phone and plays it in front of herself: the television draws its
// back, and the room is told a card lies there and never which — checked on the raw frames, as
// hidden information always is here. Ada herself still knows it (#483). Non-vacuity both ways: her
// own frames name the card, so a search that finds nothing in the others' is known to be able to.
test('a card turned over in the hand lands face down, and only its owner is told which it is', async ({ tableOf, player, open }) => {
  const table = await tableOf({ players: 2, cards: 12 })
  const ada = await player(table, { name: 'Ada', seat: table.seats[0]!, device: PHONE })
  const bo = await player(table, { name: 'Bo', seat: table.seats[1]!, device: PHONE })
  const tv = await open(TV, table.tvUrl)
  const mine = `mine:${table.seats[0]!}`

  // The felt draws its cards beside the zones and not inside them, so the loose ones are counted.
  const backs = tv.page.locator('.byd-card[data-component][data-face="back"]')
  const fronts = tv.page.locator('.byd-card[data-component][data-face="front"]')
  await expect(tv.page.locator(`[data-area="${mine}"]`)).toBeVisible()
  const [backsBefore, frontsBefore] = [await backs.count(), await fronts.count()]

  await ada.page.locator('[data-zone-draw="draw"]').click()
  const card = ada.page.locator('[data-hand-card]')
  await expect(card).toHaveCount(1)
  // The card drawn is the one marked (#1147), and the bar over the tabs holds it up.
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await ada.page.locator('[data-hand-bar]').getByRole('button', { name: 'Read large' }).click()
  const held = ada.page.getByRole('dialog')
  const title = (await held.getAttribute('aria-label'))!
  // The card stays held up: the turn is not a play, and the press under it now says how it lands.
  await held.getByRole('button', { name: 'Turn over' }).click()
  await expect(card).toHaveAttribute('data-turned', 'true')
  await expect(held.getByRole('button', { name: 'Turn face up' })).toBeVisible()
  await held.getByRole('button', { name: 'Framför mig · face down' }).click()
  await expect(card).toHaveCount(0)

  await expect(backs).toHaveCount(backsBefore + 1)
  await expect(fronts).toHaveCount(frontsBefore)

  await expect.poll(() => cardsIn(ada.wire.received(), mine), { message: 'Ada is told which card she put down' }).toHaveLength(1)
  expect(mentions(ada.wire.received(), title).length, 'Ada’s frames name it').toBeGreaterThan(0)
  expect(cardsIn(bo.wire.received(), mine), 'Bo is not').toEqual([])
  expect(cardsIn(tv.wire.received(), mine), 'the big screen is not').toEqual([])
  expect(mentions(bo.wire.received(), title), 'nor does its title reach Bo').toEqual([])
  expect(mentions(tv.wire.received(), title), 'or the big screen').toEqual([])
})

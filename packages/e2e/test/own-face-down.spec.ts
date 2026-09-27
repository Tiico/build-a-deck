import { PHONE, TV } from '../support/devices.js'
import { cardsIn } from '../support/frames.js'
import { expect, test } from '../support/test.js'

// A card of your own, turned face down in front of you (#483, fynd 8; beställarens beslut A efter
// prototyp 31). At a real table you know what you turned down; the projection told nobody, its
// owner included, so the phone said «Dolt kort» of a card its holder had just been looking at.
// «Turn down» now peeks as it flips, in one envelope: the owner is told which card it is, and the
// rest of the room is told exactly what it was told before — that a card lies there.
//
// Checked on the wire, as hidden information always is here: each client is reloaded after the
// card is down, so what it knows is what the fresh snapshot tells it, and nothing it saw while the
// card still lay face up can stand in for that.
test('tells the owner which card they turned down in front of them, and nobody else', async ({ tableOf, player, open }) => {
  const table = await tableOf({ players: 2, cards: 12 })
  const bea = await player(table, { name: 'Bea', seat: table.seats[0]!, device: PHONE })
  const ada = await player(table, { name: 'Ada', seat: table.seats[1]!, device: PHONE })
  const tv = await open(TV, table.tvUrl)
  const mine = `mine:${table.seats[0]!}`

  await bea.page.locator('[data-zone-draw="draw"]').click()
  await expect(bea.page.locator('[data-hand-card]')).toHaveCount(1)
  await bea.page.getByRole('button', { name: 'Framför mig' }).click()
  await expect(bea.page.locator('[data-hand-card]')).toHaveCount(0)
  await bea.page.locator('[data-mine-card]').first().click()
  await bea.page.getByRole('button', { name: 'Turn down' }).click()
  await expect(bea.page.locator('[data-mine-card][data-face="known"]')).toHaveCount(1)

  for (const who of [bea, ada, tv]) await who.page.reload()
  await expect(bea.page.locator('[data-hand]')).toBeVisible()
  await expect(ada.page.locator('[data-hand]')).toBeVisible()
  await tv.page.waitForTimeout(1500)
  const fresh = (frames: readonly string[]) => frames.slice(frames.findLastIndex((f) => f.includes('"snapshot"')))

  const beas = cardsIn(fresh(bea.wire.received()), mine)
  // Non-vacuity, and the decision itself: the owner's snapshot names the card.
  expect(beas, 'Bea is told which card she turned down').toHaveLength(1)
  expect(cardsIn(fresh(ada.wire.received()), mine), 'Ada is not').toEqual([])
  expect(cardsIn(fresh(tv.wire.received()), mine), 'the big screen is not').toEqual([])
})

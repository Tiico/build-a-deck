import type { APIRequestContext, Page } from '@playwright/test'
import { join } from '../support/api.js'
import { SMALL_TV } from '../support/devices.js'
import { expect, test, type Fixtures } from '../support/test.js'

// A card lifted out of the seat's own hand on /online can be put back (#484 fynd 1, 2). Every
// release used to play it: the point was projected onto the table and drawn in onto the felt, so a
// card let go back over its own column, over the top bar or in the dark beside the table was played
// all the same — one lay under the seat's own name tile and could not be taken hold of again. And
// Escape did nothing, so a lifted card had no way back at all. What is over the table's picture
// still plays, the wooden frame included (#66); what is outside it is a drag that was undone.
const WINDOW = SMALL_TV.viewport

test.describe('a card lifted out of the hand on /online (#484)', () => {
  test.use({ viewport: WINDOW })

  type Given = Pick<Fixtures, 'tableOf' | 'open' | 'host'> & { request: APIRequestContext }
  const setUp = async (fixtures: Given) => {
    const table = await fixtures.tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
    const seat = await join(fixtures.request, table, { name: 'Ada', seat: 'A' })
    const dealer = await fixtures.host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 3 }])
    const { page } = await fixtures.open(SMALL_TV, `${seat.onlineUrl}&lang=sv`)
    await expect(page.locator('[data-hand-card]')).toHaveCount(3)
    return page
  }
  // Lifted the way a hand does it: pressed, carried across past the aim threshold, and held.
  const lift = async (page: Page) => {
    const card = (await page.locator('[data-hand-card]').first().boundingBox())!
    const from = { x: card.x + card.width / 2, y: card.y + card.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x - 40, from.y, { steps: 4 })
    await expect(page.locator('.byd-fan-ghost')).toBeVisible()
    return from
  }
  const onFelt = (page: Page) => page.locator('.byd-online-felt .byd-card[data-component]')

  test('puts it back when it is let go outside the table, and plays it on the table', async ({ tableOf, open, host, request }) => {
    const page = await setUp({ tableOf, open, host, request })
    // In the dark beside the table, over the seat's own column, and over the top bar.
    for (const where of [{ x: 12, y: WINDOW.height / 2 }, 'back' as const, { x: WINDOW.width / 2, y: 20 }]) {
      const from = await lift(page)
      const to = where === 'back' ? from : where
      await page.mouse.move(to.x, to.y, { steps: 6 })
      await page.mouse.up()
      await expect(page.locator('.byd-fan-ghost')).toHaveCount(0)
      await page.waitForTimeout(300)
      await expect(page.locator('[data-hand-card]'), `let go at ${JSON.stringify(where)}`).toHaveCount(3)
      await expect(onFelt(page)).toHaveCount(0)
    }
    // On the felt it is played, as it always was.
    const felt = (await page.locator('.byd-online-felt [data-table]').boundingBox())!
    await lift(page)
    await page.mouse.move(felt.x + felt.width / 2, felt.y + felt.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(page.locator('[data-hand-card]')).toHaveCount(2)
    await expect(onFelt(page)).toHaveCount(1)
  })

  test('puts it back on Escape, and the release after it plays nothing', async ({ tableOf, open, host, request }) => {
    const page = await setUp({ tableOf, open, host, request })
    await lift(page)
    const felt = (await page.locator('.byd-online-felt [data-table]').boundingBox())!
    await page.mouse.move(felt.x + felt.width / 2, felt.y + felt.height / 2, { steps: 6 })
    await page.keyboard.press('Escape')
    await expect(page.locator('.byd-fan-ghost')).toHaveCount(0)
    await page.mouse.up()
    await page.waitForTimeout(300)
    await expect(page.locator('[data-hand-card]')).toHaveCount(3)
    await expect(onFelt(page)).toHaveCount(0)
  })
})

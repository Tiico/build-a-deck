import { join, withQuery } from '../support/api.js'
import { pastTheWaitingRoom } from '../support/waiting.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Meeples on the felt (#1475, prototype #1472 felt B), in the built app: a game with three meeples a
// seat lays each seat's as one chip with the count in front of it. A drag on Ada's chip takes the
// top meeple out onto the floor, and the seat's own screen and the room's television both see the
// same meeple lying there by itself and the chip with one fewer.
test.describe('a meeple moved on the felt (#1475)', () => {
  test.use({ viewport: DESK.viewport })

  test('a drag takes one out of the pile, and both screens see it moved', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, pieces: [{ kind: 'meeple', count: 3, role: 'mine' }] })
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(DESK, withQuery(seat.onlineUrl, 'lang=sv'))
    const { page: tv } = await open(DESK, withQuery(table.tvUrl, 'lang=sv'))
    await pastTheWaitingRoom(page)

    // One chip a seat, each saying three.
    await expect(page.locator('[data-piece-pile]')).toHaveCount(2)
    await expect(tv.locator('[data-piece-pile]')).toHaveCount(2)
    const chip = page.locator('[data-piece-pile][aria-label*="Adas"]')
    await expect(chip).toHaveAttribute('aria-label', '3 meeples, Adas, i Framför A. Enter öppnar handlingar, M flyttar den.')
    await expect(chip.locator('[data-piece-count]')).toHaveText('3')
    const id = (await chip.getAttribute('data-piece'))!

    // Out onto the middle of the felt, a little below the piles.
    const felt = (await page.locator('[data-table]').boundingBox())!
    const from = (await chip.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(felt.x + felt.width / 2, felt.y + felt.height * 0.7, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByRole('status').filter({ hasText: /flyttade en meeple/ })).toHaveText(/^Du flyttade en meeple till Spelyta$/)
    for (const screen of [page, tv]) {
      const moved = screen.locator(`[data-piece="${id}"]`)
      await expect(moved).toHaveAttribute('data-kind', 'meeple')
      await expect(moved).not.toHaveAttribute('data-piece-pile', /./)
      // Ada's chip now says two, by another of her meeples.
      await expect(screen.locator('[data-piece-pile]').filter({ has: screen.locator('[data-piece-count]', { hasText: '2' }) })).toHaveCount(1)
    }
    await expect(page.locator(`[data-piece="${id}"]`)).toHaveAttribute('aria-label', 'meeple, Adas, i Spelyta. Enter öppnar handlingar, M flyttar den.')
  })
})

import { join, withQuery } from '../support/api.js'
import { pastTheWaitingRoom } from '../support/waiting.js'
import { DESK, PHONE, TV } from '../support/devices.js'
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

// The phone (#1476, prototype #1472 telefonen A): a player with only her phone beside the
// television chooses a meeple in «Framför mig» and moves it with «Flytta till…», and the room's
// screen draws it moved. The phone never draws the table (C2): it moves to a zone, not to a point.
test.describe('a meeple moved from the phone (#1476)', () => {
  test('lands where the sheet said, and the television draws it there', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, pieces: [{ kind: 'meeple', count: 3, role: 'mine' }] })
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page: tv } = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
    const { page: phone } = await open(PHONE, withQuery(seat.playUrl, 'lang=sv'))
    await expect(tv.locator('[data-piece-pile]')).toHaveCount(2)

    await phone.getByRole('tab', { name: /^Framför mig/ }).click()
    const mine = phone.getByRole('region', { name: 'Dina meeples · 3' })
    const first = mine.getByRole('button', { name: 'meeple, Adas, i Framför A' }).first()
    const id = (await first.getAttribute('data-phone-piece'))!
    await first.click()
    await phone.getByRole('region', { name: 'Pjäsens handlingar' }).getByRole('button', { name: 'Flytta till…' }).click()
    await phone.getByRole('dialog', { name: 'Flytta din meeple till' }).getByRole('button', { name: /^Spelyta/ }).click()

    await expect(phone.getByRole('status').filter({ hasText: /flyttade en meeple/ })).toHaveText(/^Du flyttade en meeple till Spelyta$/)
    await expect(mine.getByRole('button', { name: 'meeple, Adas, i Spelyta' })).toHaveCount(1)
    // On the television it is out of the pile, by itself, and the pile says two.
    await expect(tv.locator(`[data-piece="${id}"]`)).not.toHaveAttribute('data-piece-pile', /./)
    await expect(tv.locator('[data-piece-pile] [data-piece-count]', { hasText: '2' })).toHaveCount(1)
  })
})

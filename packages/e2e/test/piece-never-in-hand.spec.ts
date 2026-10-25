import { join, withQuery } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Material is never held (#1377, K32): a die or a counter lies on the table and not in a hand. A die
// dragged onto the seat's own hand went into it, where no screen draws a piece — the hand is a row
// of cards — so it was gone from the felt and nothing could take it out again. Let go over a hand it
// lies on the felt under it, and the keyboard's «Flytta till» offers a counter no hand.
test.describe('material is never put in a hand (#1377)', () => {
  test.use({ viewport: DESK.viewport })

  test('a die dragged onto the seat’s own hand stays on the felt', async ({ tableOf, open, request, host }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 6, dice: [{ faces: 6, count: 1, zone: 'table' }] })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, withQuery(seat.onlineUrl, 'lang=sv'))
    const die = page.locator('.byd-die[data-kind="d6"]')
    await expect(die).toHaveCount(1)
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 3 }])
    await expect(page.locator('[data-hand-card]')).toHaveCount(3)

    // The hand's element is the fan's anchor, a point on the fan.
    const from = (await die.boundingBox())!
    const to = (await page.locator('.byd-hand[data-zone="hand:A"]').boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, { steps: 3 })
    await page.mouse.move(to.x, to.y - 10, { steps: 10 })
    await page.mouse.up()

    await expect(page.getByRole('status').filter({ hasText: /flyttade d6/ })).toBeVisible()
    await expect(die).toHaveCount(1)
    await expect(die).toBeVisible()
    await expect(die).not.toHaveAttribute('aria-label', /hand/i)
    await expect(page.locator('[data-hand-card]')).toHaveCount(3)
  })

  test('a counter’s «Flytta till» offers no hand', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [{ name: 'Liv', start: 20 }], cards: 4 })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, withQuery(seat.onlineUrl, 'lang=sv'))
    await expect(page.locator('.byd-token').first()).toBeVisible()

    const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kbd ?? null)
    for (let i = 0; i < 40 && (await focused()) === null; i++) await page.keyboard.press('Tab')
    for (let i = 0; i < 40 && !(await focused())?.startsWith('counter:'); i++) await page.keyboard.press('ArrowRight')
    expect(await focused()).toMatch(/^counter:/)
    await page.keyboard.press('Enter')

    const group = page.getByRole('dialog', { name: /Liv/ }).getByRole('group', { name: 'Flytta till' })
    await expect(group.getByRole('button', { name: /^Framför A/ })).toBeVisible()
    await expect(group.getByRole('button', { name: /hand/i })).toHaveCount(0)
  })
})

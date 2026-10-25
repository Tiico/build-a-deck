import { join, withQuery } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A counter moved with the keyboard (#1177, K16): Tab onto the felt, the arrows to the chip, Enter
// for its panel and «Flytta till» an area. The chip lies inside the area, in the middle of the
// place a card laid there would take — not on the area's top-left corner, which is where the
// area's answer for a card put it. Every press is a real one, since element.focus() draws no ring
// and skips the path a person without a mouse takes.
test.describe('a counter moved to an area with the keyboard (#1177)', () => {
  test.use({ viewport: DESK.viewport })

  test('lies wholly inside the area, centred across it, and not on its corner', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [{ name: 'Liv', start: 20 }], cards: 4 })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, withQuery(seat.onlineUrl, `lang=sv`))
    const chips = page.locator('.byd-token')
    await expect(chips.first()).toBeVisible()

    const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kbd ?? null)
    // Tab until the felt holds the focus, then the arrows to a counter: the felt is one tab stop.
    for (let i = 0; i < 40 && (await focused()) === null; i++) await page.keyboard.press('Tab')
    for (let i = 0; i < 40 && !(await focused())?.startsWith('counter:'); i++) await page.keyboard.press('ArrowRight')
    const key = await focused()
    expect(key).toMatch(/^counter:/)
    const id = key!.slice('counter:'.length)
    const chip = page.locator(`[data-counter-token="${id}"]`)
    await expect(chip).toBeFocused()

    await page.keyboard.press('Enter')
    const panel = page.getByRole('dialog', { name: /Liv/ })
    await expect(panel).toBeVisible()
    const group = panel.getByRole('group', { name: 'Flytta till' })
    // The area in front of this seat, which is this seat's to put things in and holds no chip yet.
    const place = group.getByRole('button', { name: /^Framför A/ })
    // Tab through the panel to it, as a reader without a mouse does.
    for (let i = 0; i < 40 && !(await place.evaluate((b) => b === document.activeElement)); i++) await page.keyboard.press('Tab')
    await expect(place).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(panel).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: /flyttade/ })).toHaveText(/^Du flyttade Liv till /)
    await expect(chip).toBeFocused()

    const area = (await page.locator('[data-area="mine:A"]').boundingBox())!
    const box = (await chip.boundingBox())!
    // Wholly inside the area.
    expect(box.x).toBeGreaterThanOrEqual(area.x)
    expect(box.y).toBeGreaterThanOrEqual(area.y)
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width)
    expect(box.y + box.height).toBeLessThanOrEqual(area.y + area.height)
    // Centred across the area's short axis, as a card laid there is, and clear of its corner by
    // more than half the chip along the long one, where a card's place puts its middle — measured
    // as a share of the chip, so no pixel of any one machine is pinned.
    const across = area.width >= area.height ? [box.y - area.y, area.y + area.height - (box.y + box.height)] : [box.x - area.x, area.x + area.width - (box.x + box.width)]
    expect(Math.abs(across[0]! - across[1]!)).toBeLessThan(box.width * 0.1)
    const along = area.width >= area.height ? box.x - area.x : box.y - area.y
    expect(along).toBeGreaterThan(box.width * 0.5)
  })
})

import { join } from '../support/api.js'
import type { Device } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Reading a card in the hand on the distance view (K26, #510 beslut B). The column's card is 112 px
// and its hover drew 180 px, 8.6 px of body text; a press opened the panel straight away. Now a
// hover or a press lifts the card beside the column the way the felt lifts one (#509), the second
// press opens the panel, and «Visa alla» lays the hand out at the size a card is read at.
//
// What the sizes carry is measured against K26's module in `packages/web/test`; this is the journey
// in the built app, in the windows the distance view lives in.
for (const device of [
  { name: 'tablet-flat', viewport: { width: 1024, height: 768 } },
  { name: 'laptop', viewport: { width: 1280, height: 800 } },
] satisfies Device[]) {
  test.describe(`the hand on the distance view at ${device.viewport.width} × ${device.viewport.height} (#510)`, () => {
    test.use({ viewport: device.viewport })

    test('a hover reads a card beside the column, a press keeps it, and the second press opens the panel', async ({ tableOf, open, host, request }) => {
      const table = await tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
      const dealer = await host(table)
      await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 4 }])
      const seat = await join(request, table, { name: 'Ada', seat: 'A' })
      const { page } = await open(device, `${seat.onlineUrl}&lang=sv`)
      const cards = page.locator('[data-hand-card]')
      await expect(cards).toHaveCount(4)
      const card = cards.nth(1)
      const at = (await card.boundingBox())!

      await page.mouse.move(at.x + at.width / 2, at.y + 12)
      const lift = page.locator('[data-lift]')
      // The card lifted is the one the pointer is on, and not a neighbour it covers or is covered by.
      const under = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-hand-card]')?.getAttribute('data-hand-card'), [at.x + at.width / 2, at.y + 12])
      expect(under).toBe(await card.getAttribute('data-hand-card'))
      await expect(lift).toHaveAttribute('data-lift', under!)
      const box = (await lift.boundingBox())!
      // In the window, whole, beside the column and not over the card, and larger than the fixed
      // sizes it replaces.
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(device.viewport.height)
      expect(box.x + box.width).toBeLessThanOrEqual(at.x)
      expect(box.width).toBeGreaterThan(252)

      await page.mouse.click(at.x + at.width / 2, at.y + 12)
      await expect(page.getByRole('dialog', { name: /^Handlingar för/ })).toHaveCount(0)
      await page.mouse.move(4, device.viewport.height / 2)
      await expect(lift).toHaveCount(1)

      await page.mouse.click(at.x + at.width / 2, at.y + 12)
      await expect(page.getByRole('dialog', { name: /^Handlingar för/ })).toBeVisible()
    })

    test('«Visa alla» lays the hand out at the size a card is read at, and the page never scrolls sideways', async ({ tableOf, open, host, request }) => {
      const table = await tableOf({ players: 2, counters: [], cards: 13, copies: 1 })
      const dealer = await host(table)
      await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 13 }])
      const seat = await join(request, table, { name: 'Ada', seat: 'A' })
      const { page } = await open(device, `${seat.onlineUrl}&lang=sv`)
      await expect(page.locator('[data-hand-card]')).toHaveCount(13)
      await page.getByRole('button', { name: 'Visa alla' }).click()
      const grid = page.locator('[data-spread-card]')
      await expect(grid).toHaveCount(13)
      const widths = await grid.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width))
      expect(Math.min(...widths)).toBeGreaterThanOrEqual(295)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    })
  })
}

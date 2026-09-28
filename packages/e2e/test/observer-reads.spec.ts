import type { Device } from '../support/devices.js'
import { SMALL_TV, TV } from '../support/devices.js'
import { join } from '../support/api.js'
import { expect, test } from '../support/test.js'
import { DEFAULT_BODY_PT, SCREENS, textPxOnCard } from '../../web/test/legibility.js'

// The observer reads a card in any hand (C8, K26, #511, beslut A). Her felt draws every hand, and
// at 1280 × 800 a card in one is 34 px across: 1.6 px of body text. The hands' cards used to
// answer no pointer at all, so her inspection panel — 138 px, 6.6 px of body — could never show
// one. Now a resting mouse or a press lifts it beside itself in the window's size, the gesture the
// table screen reads with (#509), and there is nothing to ask of it.
//
// This is the built app with the stylesheet the build shipped, measured against K26's module.
for (const device of [SMALL_TV, TV] as Device[]) {
  test.describe(`the observer reads a hand at ${device.viewport.width} × ${device.viewport.height} (#511)`, () => {
    test.use({ viewport: device.viewport })

    test('a card in a player’s hand lifts beside itself at the desk’s reading size, and asks nothing', async ({ tableOf, host, request, open }) => {
      const table = await tableOf({ players: 2, counters: [], cards: 12, copies: 1 })
      const dealer = await host(table)
      await dealer.send([{ v: 'seat.claim', seat: 'A', name: 'Ada' } as never, { v: 'draw', from: 'draw', to: 'hand:A', count: 3 } as never])
      const eva = await join(request, table, { name: 'Eva' })
      const { page } = await open(device, `${eva.observeUrl}&lang=sv`)

      const card = page.locator('[data-zone="hand:A"] .byd-hand-card').last()
      await expect(card).toHaveAttribute('data-face', 'front')
      await card.hover()
      const lift = page.locator('[data-lift]')
      await expect(lift).toHaveCount(1)
      await expect(lift).toHaveAttribute('data-lift', (await card.getAttribute('data-component'))!)

      const box = (await lift.boundingBox())!
      const window = device.viewport
      const body = textPxOnCard(DEFAULT_BODY_PT, box.width)
      const at = `${window.width} × ${window.height}, lift ${Math.round(box.width)} px`
      expect({ at, reads: body >= SCREENS.desk.bodyPx.min }).toEqual({ at, reads: true })
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(window.width)
      expect(box.y + box.height).toBeLessThanOrEqual(window.height)

      // A press keeps it and asks nothing: she may not touch the table (C8).
      await card.click()
      await page.mouse.move(4, 4)
      await expect(lift).toHaveCount(1)
      await expect(page.locator('[data-radial]')).toHaveCount(0)
      await page.keyboard.press('Escape')
      await expect(lift).toHaveCount(0)
    })
  })
}

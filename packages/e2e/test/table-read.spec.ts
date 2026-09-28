import type { Device } from '../support/devices.js'
import { DESK } from '../support/devices.js'
import { standing } from '../support/surface.js'
import { expect, test } from '../support/test.js'

// Reading a card on the table screen (K26, K8, #509): the first press lifts it up beside itself in
// the room the window has, and the ring is behind a second press. It used to be three: the press
// opened the ring, «Titta» held it up in a fixed 252 px, and Escape put it down.
//
// What the lift's size carries — the body text over K26's floor — is measured against K26's module
// in `packages/web/test/felt-lift.test.tsx`. This is the journey in the built app, with the real
// pointer events a browser makes of a click, and the stylesheet the build actually shipped.

// The smallest screen the table screen is measured at: a tablet lying on the table.
const TABLET_FLAT: Device = { name: 'tablet-flat', viewport: { width: 1024, height: 768 } }

for (const device of [TABLET_FLAT, DESK]) {
  test.describe(`reading a card on the table screen at ${device.viewport.width} × ${device.viewport.height} (#509)`, () => {
    test.use({ viewport: device.viewport })

    test('one press reads the card beside itself, and the second asks what to do with it', async ({ tableOf, host, open }) => {
      const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
      const dealer = await host(table)
      await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
      const { page } = await open(device, `${table.tableUrl}&lang=sv`)
      const card = page.locator('.byd-card[data-component]').first()
      await expect(card).toHaveAttribute('data-face', 'back')

      // A face-down card has nothing to read: the press asks, as it always has, and Vänd turns it.
      await card.click()
      await expect(page.locator('[data-lift]')).toHaveCount(0)
      await page.getByRole('button', { name: 'Vänd' }).click()
      await expect(card).toHaveAttribute('data-face', 'front')
      // The mouse is still on the card it just turned, and resting on a card reads it. Away first,
      // so what follows is the press and not the rest.
      await page.mouse.move(4, 4)
      await expect(page.locator('[data-lift]')).toHaveCount(0)

      await card.click()
      const lift = page.locator('[data-lift]')
      await expect(lift).toHaveCount(1)
      await expect(page.locator('[data-radial]')).toHaveCount(0)

      const window = device.viewport
      const box = (await lift.boundingBox())!
      const at = (await card.boundingBox())!
      // In the window, whole, and beside the card rather than over it.
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(window.width)
      expect(box.y + box.height).toBeLessThanOrEqual(window.height)
      expect(box.x >= at.x + at.width || box.x + box.width <= at.x).toBe(true)
      // The room the window has, and not the fixed 252 px «Titta» was.
      expect(box.width).toBeGreaterThan(252)
      expect(box.width / box.height).toBeCloseTo(63 / 88, 2)

      // Escape puts it down; so does asking, and the ring opens on the card and not over its text.
      await page.keyboard.press('Escape')
      await expect(lift).toHaveCount(0)
      await card.click()
      await expect(lift).toHaveCount(1)
      await card.click()
      await expect(page.locator('[data-radial]')).toHaveCount(1)
      await expect(lift).toHaveCount(0)
    })
  })
}

test.describe('the lifted card in the shipped stylesheet (#509)', () => {
  test.use({ viewport: DESK.viewport })

  // The box is placed from script, and the card's face is an image laid over the card's own paper.
  // A padding or a missing `inset` would draw the face smaller than the box that was measured.
  test('fills its box with the face, edge to edge', async ({ page }) => {
    const face = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="372" height="520"><rect width="372" height="520" fill="#c33"/></svg>')
    await standing(page, `<div class="byd-lift" data-lift="c1" data-face="front" style="left: 40px; top: 30px; width: 341px; height: 476px; --hue: 12"><img class="byd-texture" src="${face}" alt=""><span>Björnen</span></div>`, { at: '/table' })
    const img = page.locator('[data-lift] img')
    await expect(img).toBeVisible()
    const drawn = (await img.boundingBox())!
    expect({ x: drawn.x, y: drawn.y, w: Math.round(drawn.width), h: Math.round(drawn.height) }).toEqual({ x: 40, y: 30, w: 341, h: 476 })
  })
})

import type { Device } from '../support/devices.js'
import { DESK } from '../support/devices.js'
import { join, withQuery } from '../support/api.js'
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
      const { page } = await open(device, withQuery(table.tableUrl, 'lang=sv'))
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

// The distance view draws the same felt under its own header (#509). The felt's frame carries the
// tilt's `perspective`, and a `perspective` makes an element the box every `position: fixed` inside
// it is placed in — so a ring or a lift placed in window coordinates landed a header's height below
// where it was asked for, and the lift ran off the bottom of the window.
test.describe('the felt under the distance view’s header (#509)', () => {
  const LAPTOP: Device = { name: 'laptop', viewport: { width: 1280, height: 800 } }
  test.use({ viewport: LAPTOP.viewport })

  test('opens the ring where it was pressed, and keeps the lift whole in the window', async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(LAPTOP, withQuery(seat.onlineUrl, `lang=sv`))
    const card = page.locator('.byd-online-felt .byd-card[data-component]').first()
    await expect(card).toHaveAttribute('data-face', 'back')

    const at = (await card.boundingBox())!
    const x = at.x + at.width / 2
    const y = at.y + at.height / 2
    await page.mouse.click(x, y)
    const ring = page.locator('.byd-radial')
    await expect(ring).toHaveCount(1)
    const centre = (await ring.boundingBox())!
    expect({ x: Math.round(centre.x), y: Math.round(centre.y) }).toEqual({ x: Math.round(x), y: Math.round(y) })
    await page.getByRole('button', { name: 'Vänd' }).click()
    await expect(card).toHaveAttribute('data-face', 'front')
    await page.mouse.move(4, 790)

    await card.click()
    const lift = page.locator('[data-lift]')
    await expect(lift).toHaveCount(1)
    const box = (await lift.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(LAPTOP.viewport.height)
    expect(box.x + box.width).toBeLessThanOrEqual(LAPTOP.viewport.width)
  })
})

// A card along the felt's top edge is lifted to the window's top, and the whole lift must be seen
// there. Its box said so all along; what the reader saw did not. On the distance view the lift
// stood in the felt's row, which clips what leaves it, so its top was cut off under the header.
// On the table screen the plate along the top was drawn over it: the felt is a stacking context of
// its own (the tilt's `perspective`), and nothing in it rises above what lies over the felt. A box
// cannot see either, so this asks the page what is painted along the lift's edges.
test.describe('a card read at the top of the felt (#509)', () => {
  const LAPTOP: Device = { name: 'laptop', viewport: { width: 1280, height: 800 } }
  test.use({ viewport: LAPTOP.viewport })

  for (const where of ['online', 'table'] as const) {
    test(`is lifted whole and on top of everything on ${where === 'online' ? 'the distance view' : 'the table screen'}`, async ({ tableOf, open, host, request }) => {
      const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
      const dealer = await host(table)
      await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
      const seat = await join(request, table, { name: 'Ada', seat: 'A' })
      const { page } = await open(LAPTOP, withQuery(where === 'online' ? seat.onlineUrl : table.tableUrl, `lang=sv`))
      const card = page.locator(`${where === 'online' ? '.byd-online-felt ' : ''}.byd-card[data-component]`).first()
      await expect(card).toHaveAttribute('data-face', 'back')
      await card.click()
      await page.getByRole('button', { name: 'Vänd' }).click()
      await expect(card).toHaveAttribute('data-face', 'front')
      // To the felt's top edge, under the plate's end of it.
      await dealer.send([{ v: 'move', component: (await card.getAttribute('data-component'))!, to: 'table', x: 40, y: 0 }])
      await page.mouse.move(4, 790)
      await expect.poll(async () => (await card.boundingBox())!.y).toBeLessThan(160)

      const at = (await card.boundingBox())!
      await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2)
      const lift = page.locator('[data-lift]')
      await expect(lift).toHaveCount(1)
      const box = (await lift.boundingBox())!
      expect(box.y).toBeLessThan(at.y)
      // Every few pixels along all four edges, just inside them and clear of the rounded corners:
      // the lift, and nothing else.
      const hidden = await page.evaluate(`(() => {
        const lift = document.querySelector('[data-lift]')
        const r = lift.getBoundingClientRect()
        const points = []
        for (let x = r.left + 16; x <= r.right - 16; x += 8) points.push([x, r.top + 2], [x, r.bottom - 2])
        for (let y = r.top + 16; y <= r.bottom - 16; y += 8) points.push([r.left + 2, y], [r.right - 2, y])
        return points.filter(([x, y]) => {
          const hit = document.elementFromPoint(x, y)
          return !hit || !lift.contains(hit)
        }).map(([x, y]) => [Math.round(x), Math.round(y), document.elementFromPoint(x, y)?.className ?? null])
      })()`)
      expect(hidden).toEqual([])
    })
  }
})

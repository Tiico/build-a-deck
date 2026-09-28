import { join } from '../support/api.js'
import type { Device } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A large tablet held upright, with a finger: the distance view in its band shape (#484). A smaller
// one gets the player's surface since fynd 9, where a felt card would be under K9's 45 px.
const TABLET: Device = { name: 'tablet', viewport: { width: 1024, height: 1366 }, hasTouch: true, isMobile: true }

// A tap on a card on the felt opens the ring, and the ring stays (#484 fynd 3, same root as #482
// fynd 1). The ring opens on the tap's release; the browser then makes a `click` of the touch and
// hit-tests it where the finger was — on the ring's backdrop, which had arrived there in between and
// closed on it. Eight milliseconds of ring. A mouse never saw it: its click goes to the card the
// press went down and up on. Only a real touch in an engine that synthesises that click can say.
test.describe('a finger on the distance view (#484)', () => {
  test.use({ viewport: TABLET.viewport, hasTouch: true, isMobile: true })

  test('opens the ring on a card with a tap, and the ring stays open', async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(TABLET, `${seat.onlineUrl}&lang=sv`)
    const card = page.locator('.byd-online-felt .byd-card[data-component]').first()
    await expect(card).toBeVisible()
    const box = (await card.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.locator('[data-radial]')).toHaveCount(1)
    // The card lies in the felt's corner, so the ring is drawn in from the edge and a verb stands
    // under the finger: the tap's click ran it, until a verb's click counted only from a press on it.
    // Long past the synthesised click, which arrives within a frame or two of the touch ending.
    await page.waitForTimeout(400)
    await expect(page.locator('[data-radial]')).toHaveCount(1)
    await expect(page.locator('.byd-online-felt .byd-card[data-component]')).toHaveAttribute('data-face', 'back')
    // And a tap on the backdrop is still the way out.
    await page.touchscreen.tap(8, box.y + box.height / 2)
    await expect(page.locator('[data-radial]')).toHaveCount(0)
  })

  // A tap on a card in the hand opens it (#484 fynd 10, beslut A): the address panel, as a tap in
  // «Visa alla» does. Before, tap and hold did nothing, and a finger could not read its own hand.
  test('opens a card in the hand with a tap', async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 2 }])
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(TABLET, `${seat.onlineUrl}&lang=sv`)
    const card = page.locator('[data-hand-card]').first()
    await expect(card).toBeVisible()
    const box = (await card.boundingBox())!
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
    const panel = page.getByRole('dialog', { name: /^Handlingar för/ })
    await expect(panel).toBeVisible()
    // And it stays: the click the browser makes of the touch lands on the panel's backdrop.
    await page.waitForTimeout(400)
    await expect(panel).toBeVisible()
  })
})


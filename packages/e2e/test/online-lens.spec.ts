import type { Page } from '@playwright/test'
import { join } from '../support/api.js'
import { expect, test } from '../support/test.js'

// A lens on the felt of /online (#502, beslut B, prototyp 36). K9 asks 45 px of a card on the felt,
// and /online reached it only for a four-seat table from 1280 × 720: measured, 36 px at 1024 × 600
// and 20–41 px at eight seats in every landscape window. At rest the whole table is shown as before;
// the first step in lands on the scale that gives a card 45 px, and «Hela bordet» takes it back.
const cardPx = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.byd-online-felt .byd-card[data-component]')!.getBoundingClientRect()
    return Math.round(Math.min(c.width, c.height))
  })
// The card as laid out on the felt, before the tilt paints it: the lens brings this to 45 px, which
// the perspective paints at 45.2 px at the far rim, 46.8 in the middle and 48.4 at the near rim —
// measured at 1024 × 600 and 1280 × 800 — so the floor holds wherever on the felt a card lies.
const laidOut = (page: Page) => page.evaluate(() => (document.querySelector('.byd-online-felt .byd-card[data-component]') as HTMLElement).offsetWidth)

for (const [players, w, h] of [[8, 1280, 800], [4, 1024, 600], [8, 1920, 1080]] as const) {
  test(`brings a card to K9's 45 px in one step at ${players} seats, ${w} × ${h}, and gives the whole table back`, async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players, counters: [], cards: 30, copies: 1 })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }, { v: 'draw', from: 'draw', to: 'hand:A', count: 5 }])
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open({ name: 'd', viewport: { width: w, height: h } }, `${seat.onlineUrl}&lang=sv`)
    await expect(page.locator('.byd-online-felt .byd-card[data-component]')).toBeVisible()
    const rest = await cardPx(page)
    expect(rest, 'the table at rest is the whole table, under the floor').toBeLessThan(45)
    await page.getByRole('button', { name: 'Zooma in' }).click()
    await expect.poll(() => laidOut(page)).toBe(45)
    expect(await cardPx(page)).toBeGreaterThanOrEqual(45)
    await page.getByRole('button', { name: 'Visa hela bordet' }).click()
    await expect.poll(() => cardPx(page)).toBe(rest)
    // Escape is the other way back, as it is for every door.
    await page.getByRole('button', { name: 'Zooma in' }).click()
    await expect.poll(() => cardPx(page)).toBeGreaterThanOrEqual(45)
    await page.keyboard.press('Escape')
    await expect.poll(() => cardPx(page)).toBe(rest)
  })
}

test('lands a card from the hand where it is let go while the felt is enlarged', async ({ tableOf, open, host, request }) => {
  const table = await tableOf({ players: 8, counters: [], cards: 30, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 3 }])
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  const { page } = await open({ name: 'd', viewport: { width: 1280, height: 800 } }, `${seat.onlineUrl}&lang=sv`)
  await expect(page.locator('[data-hand-card]')).toHaveCount(3)
  await page.getByRole('button', { name: 'Zooma in' }).click()
  const zone = page.locator('.byd-zone[data-area="mine:B"]')
  await expect(zone).toBeVisible()
  const z = (await zone.boundingBox())!
  const c = (await page.locator('[data-hand-card]').first().boundingBox())!
  await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2)
  await page.mouse.down()
  await page.mouse.move(c.x - 40, c.y + c.height / 2, { steps: 4 })
  await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 8 })
  await expect(zone).toHaveAttribute('data-aimed', '')
  await page.mouse.up()
  await expect(page.locator('[data-hand-card]')).toHaveCount(2)
  await expect(page.locator('.byd-online-felt .byd-card[data-component]')).toHaveCount(1)
  const landed = (await page.locator('.byd-online-felt .byd-card[data-component]').boundingBox())!
  const middle = { x: landed.x + landed.width / 2, y: landed.y + landed.height / 2 }
  expect(middle.x > z.x && middle.x < z.x + z.width && middle.y > z.y - landed.height && middle.y < z.y + z.height + landed.height, 'the card lies where it was let go').toBe(true)
})

// The lens is moved by the hand on the bare felt, and the wheel enlarges about the pointer (#502).
test('moves an enlarged felt by a drag on the bare felt, and enlarges about the pointer with the wheel', async ({ tableOf, open, request }) => {
  const table = await tableOf({ players: 8, counters: [], cards: 30, copies: 1 })
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  const { page } = await open({ name: 'd', viewport: { width: 1280, height: 800 } }, `${seat.onlineUrl}&lang=sv`)
  const wood = page.locator('.byd-online-felt .byd-table-wood')
  const frame = page.locator('.byd-online-felt .byd-table-frame')
  await expect(wood).toBeVisible()
  const f = (await frame.boundingBox())!
  // The wheel over the upper left of the felt: that corner comes nearer, and stays under the pointer.
  const at = { x: f.x + f.width * 0.3, y: f.y + f.height * 0.3 }
  await page.mouse.move(at.x, at.y)
  await page.mouse.wheel(0, -300)
  await expect(frame).not.toHaveAttribute('data-lens', '100')
  const after = (await wood.boundingBox())!
  expect(after.x, 'the felt grew toward the pointer, not from its middle').toBeGreaterThan(f.x - (after.width - f.width) / 2 - 1)
  // A drag on the bare felt moves it.
  const before = (await wood.boundingBox())!
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2)
  await page.mouse.down()
  await page.mouse.move(f.x + f.width / 2 - 120, f.y + f.height / 2 - 60, { steps: 6 })
  await page.mouse.up()
  const moved = (await wood.boundingBox())!
  expect(Math.round(moved.x - before.x)).toBeLessThan(-20)
})

// The corner is one control that changes form (#502): its way in becomes the camera's cluster and
// back, and the keyboard's focus goes with it rather than falling to the page.
test('keeps the keyboard in the corner as its way in becomes the cluster and back', async ({ tableOf, open, request }) => {
  const table = await tableOf({ players: 8, counters: [], cards: 30, copies: 1 })
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  const { page } = await open({ name: 'd', viewport: { width: 1280, height: 800 } }, `${seat.onlineUrl}&lang=sv`)
  const zoomIn = page.getByRole('button', { name: 'Zooma in' })
  await zoomIn.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Visa hela bordet' })).toBeVisible()
  await expect(zoomIn).toBeFocused()
  await page.getByRole('button', { name: 'Visa hela bordet' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Visa hela bordet' })).toHaveCount(0)
  await expect(zoomIn).toBeFocused()
})

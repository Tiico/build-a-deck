import { join } from '../support/api.js'
import { expect, test } from '../support/test.js'

// The ring on /online is a group named for what it was opened on, and Escape from inside it hands
// focus back to that card (#560 P-10). It used to be four loose buttons, and an Escape after a Tab
// into it closed the ring and left focus on BODY — a keyboard reader lost her place on the felt.
// Only real presses in a real engine can say where focus went.
test('the ring says what it is about, and Escape gives focus back to the card', async ({ tableOf, open, host, request }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 5, copies: 1 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const seat = await join(request, table, { name: 'Ada', seat: 'A' })
  const { page } = await open({ name: 'd', viewport: { width: 1280, height: 800 } }, `${seat.onlineUrl}&lang=sv`)
  const card = page.locator('.byd-online-felt .byd-card[data-component]').first()
  await expect(card).toBeVisible()
  const box = (await card.boundingBox())!
  // The card lies face down, so there is nothing to read and one press asks what to do with it.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const ring = page.locator('[data-radial]')
  await expect(ring).toHaveCount(1)
  await expect(ring).toHaveAttribute('role', 'group')
  await expect(ring).toHaveAccessibleName('Dolt kort, kort i Spelyta')

  await page.keyboard.press('Tab')
  await expect(page.locator('[data-radial] button:focus')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(ring).toHaveCount(0)
  const kbd = await card.getAttribute('data-kbd')
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-kbd') ?? document.activeElement?.tagName)
  await expect.poll(focused).toBe(kbd)

  // A verb chosen from the keyboard closes the ring the same way, and focus stays on the card.
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(ring).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(page.locator('[data-radial] button:focus')).toHaveText('Vänd')
  await page.keyboard.press('Enter')
  await expect(ring).toHaveCount(0)
  await expect(card).toHaveAttribute('data-face', 'front')
  await expect.poll(focused).toBe(kbd)
})

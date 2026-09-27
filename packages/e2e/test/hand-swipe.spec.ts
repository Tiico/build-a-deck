import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'
import type { Page } from '@playwright/test'

// A sideways swipe through the hand is a scroll and never a choice (#483, fynd 1; K4, K10). The
// browser takes a pan over with `pointercancel`, and the strip used to answer that like a lifted
// finger: a tap on the card the thumb started on — or, if the thumb rested a moment first, a hold
// that added it to a multiple choice. Driven with real touch points through the DevTools protocol,
// because that is the only input that makes the browser pan and cancel the way a thumb does.
async function swipe(page: Page, from: { x: number; y: number }, dx: number, restMs = 0): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  if (restMs > 0) await page.waitForTimeout(restMs)
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (dx * step) / 12, from.y + (step % 2)) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test.describe('a swipe through the hand on a phone', () => {
  test('scrolls the strip and leaves the choice as it was, however the thumb set off', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const draw = ada.page.locator('[data-zone-draw="draw"]')
    await expect(draw).toBeVisible()
    for (let held = 1; held <= 8; held++) {
      await draw.click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(held)
    }
    const chosen = () => ada.page.$$eval('[data-hand-card][data-selected="true"]', (els) => els.map((el) => el.getAttribute('data-hand-card')))
    const before = await chosen()
    expect(before).toHaveLength(1)

    for (const restMs of [0, 600]) {
      // Start on a card that is not the chosen one, so a tap on it would show.
      const start = await ada.page.evaluate(() => {
        const strip = document.querySelector('.byd-strip[data-hand]') as HTMLElement
        const s = strip.getBoundingClientRect()
        const card = [...strip.querySelectorAll<HTMLElement>('[data-hand-card][data-selected="false"]')].find((el) => {
          const b = el.getBoundingClientRect()
          return b.left > s.left + 10 && b.right < s.right - 10
        })!
        const b = card.getBoundingClientRect()
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, scrolled: strip.scrollLeft }
      })
      await swipe(ada.page, start, start.x > 195 ? -150 : 150, restMs)
      await ada.page.waitForTimeout(700)
      expect(await chosen(), `after a swipe that rested ${restMs} ms`).toEqual(before)
      // Not vacuous: the swipe did move the strip.
      const scrolled = await ada.page.evaluate(() => (document.querySelector('.byd-strip[data-hand]') as HTMLElement).scrollLeft)
      expect(scrolled, `the swipe that rested ${restMs} ms scrolled the strip`).not.toBe(start.scrolled)
    }
  })
})

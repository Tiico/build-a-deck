import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'
import type { Page } from '@playwright/test'

// A swipe through the hand is a scroll and never a mark (#483, fynd 1; K10; #1147). A press marks
// a card, and the browser takes a pan over with `pointercancel` and sends no click — so a thumb
// that sets off on a card and goes up the grid scrolls the panel and marks nothing. Driven with
// real touch points through the DevTools protocol, because that is the only input that makes the
// browser pan and cancel the way a thumb does.
async function swipe(page: Page, from: { x: number; y: number }, dy: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  for (let step = 1; step <= 12; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (step % 2), from.y + (dy * step) / 12) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test.describe('a swipe through the hand on a phone', () => {
  test('scrolls the panel and leaves the marks as they were', async ({ tableOf, player, host }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 12 }])
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(12)
    const marked = () => ada.page.$$eval('[data-hand-card][data-selected="true"]', (els) => els.map((el) => el.getAttribute('data-hand-card')))
    expect(await marked()).toEqual([])

    // Start on a card in the middle of the panel, so a mark on it would show.
    const start = await ada.page.evaluate(() => {
      const panel = document.querySelector('.byd-panels') as HTMLElement
      const p = panel.getBoundingClientRect()
      const card = [...panel.querySelectorAll<HTMLElement>('[data-hand-card]')].find((el) => {
        const b = el.getBoundingClientRect()
        return b.top > p.top + 40 && b.bottom < p.bottom - 40
      })!
      const b = card.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, scrolled: panel.scrollTop }
    })
    await swipe(ada.page, start, -240)
    await ada.page.waitForTimeout(700)
    expect(await marked()).toEqual([])
    // Not vacuous: the swipe did move the panel.
    const scrolled = await ada.page.evaluate(() => (document.querySelector('.byd-panels') as HTMLElement).scrollTop)
    expect(scrolled).toBeGreaterThan(start.scrolled)
  })
})

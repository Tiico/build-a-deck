import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'
import type { Page } from '@playwright/test'

// A sideways swipe through the hand is a scroll and never a choice (#483, fynd 1; K4, K10). The
// browser takes a pan over with `pointercancel`, and the strip used to answer that like a lifted
// finger: a tap on the card the thumb started on — or, if the thumb rested a moment first, a hold
// that added it to a multiple choice. Driven with real touch points through the DevTools protocol,
// because that is the only input that makes the browser pan and cancel the way a thumb does.
// One transparent pixel: a face that has arrived.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64')

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

    for (const restMs of [0]) {
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

  // A thumb that rests until the card lifts and then goes sideways carries the card to a new place
  // in the hand (K4; #483 fynd 12, beslut A efter prototyp 33) — and still chooses nothing.
  test('re-sorts the hand when the thumb rests until the card lifts, and leaves the choice as it was', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const draw = ada.page.locator('[data-zone-draw="draw"]')
    await expect(draw).toBeVisible()
    for (let held = 1; held <= 3; held++) {
      await draw.click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(held)
    }
    const order = () => ada.page.$$eval('[data-hand-card]', (els) => els.map((el) => el.getAttribute('data-hand-card')))
    const chosen = () => ada.page.$$eval('[data-hand-card][data-selected="true"]', (els) => els.map((el) => el.getAttribute('data-hand-card')))
    const before = { order: await order(), chosen: await chosen() }
    // The first card in the strip, carried past the second — with the strip at its start, since it
    // keeps the newest card in view and the first one lies off the screen until it is scrolled to.
    await ada.page.locator('.byd-strip[data-hand]').evaluate((el) => (el.scrollLeft = 0))
    const start = await ada.page.locator('[data-hand-card]').first().evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
    const step = await ada.page.locator('[data-hand-card]').nth(1).evaluate((el) => el.getBoundingClientRect().width)
    await swipe(ada.page, start, Math.round(step * 1.2), 600)
    await expect.poll(order).toEqual([before.order[1], before.order[0], before.order[2]])
    expect(await chosen()).toEqual(before.chosen)
  })

  // A thumb that carries the card and lets go in one quick motion, on a phone whose main thread is
  // busy (#590): the last move and the lift reach the page together, before the move has been
  // drawn. The lift still lands the card where the thumb let go of it.
  test('re-sorts the hand when the thumb lets go before the last move has been drawn', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const draw = ada.page.locator('[data-zone-draw="draw"]')
    await expect(draw).toBeVisible()
    for (let held = 1; held <= 3; held++) {
      await draw.click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(held)
    }
    const order = () => ada.page.$$eval('[data-hand-card]', (els) => els.map((el) => el.getAttribute('data-hand-card')))
    const before = await order()
    await ada.page.locator('.byd-strip[data-hand]').evaluate((el) => (el.scrollLeft = 0))
    const start = await ada.page.locator('[data-hand-card]').first().evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
    const step = await ada.page.locator('[data-hand-card]').nth(1).evaluate((el) => el.getBoundingClientRect().width)

    const cdp = await ada.page.context().newCDPSession(ada.page)
    const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.x, start.y) })
    await ada.page.waitForTimeout(600)
    await expect(ada.page.locator('[data-hand-card][data-lifting="true"]')).toHaveCount(1)
    // Far enough to carry the card, not yet past the next one: drawn, and it would land where it was.
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.x + 16, start.y) })
    await expect(ada.page.locator('[data-hand-card][data-carried="true"]')).toHaveCount(1)
    // The page is busy while the rest of the gesture arrives, so both events wait for it together.
    await ada.page.evaluate(() => setTimeout(() => { const until = performance.now() + 300; while (performance.now() < until); }, 0))
    const x = start.x + Math.round(step * 1.2)
    const moved = cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, start.y) })
    const lifted = cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await Promise.all([moved, lifted])
    await cdp.detach()

    await expect.poll(order).toEqual([before[1], before[0], before[2]])
  })

  // The thumb lands on a card whose face is still being rendered, on the words that say so; the
  // face arrives while the card is being carried, and those words go (#590). The carry is the
  // thumb's still: a touch keeps the target it began on, so it must never begin on something that
  // can leave the page under it.
  test('re-sorts the hand when the carried card s face arrives on the way', async ({ tableOf, player }) => {
    const table = await tableOf({ players: 4, cards: 16 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    // The faces wait until the card has been lifted and is on its way, and are then a plain image:
    // what is under test is the strip, not the render farm.
    let release!: () => void
    const released = new Promise<void>((resolve) => (release = resolve))
    await ada.page.route('**/faces/**', async (route) => {
      await released
      await route.fulfill({ contentType: 'image/png', body: PIXEL })
    })
    const draw = ada.page.locator('[data-zone-draw="draw"]')
    await expect(draw).toBeVisible()
    for (let held = 1; held <= 3; held++) {
      await draw.click()
      await expect(ada.page.locator('[data-hand-card]')).toHaveCount(held)
    }
    const order = () => ada.page.$$eval('[data-hand-card]', (els) => els.map((el) => el.getAttribute('data-hand-card')))
    const before = await order()
    await ada.page.locator('.byd-strip[data-hand]').evaluate((el) => (el.scrollLeft = 0))
    const first = ada.page.locator('[data-hand-card]').first()
    await expect(first.locator('[data-texture="pending"]')).toBeVisible()
    const start = await first.evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
    const step = await ada.page.locator('[data-hand-card]').nth(1).evaluate((el) => el.getBoundingClientRect().width)

    const cdp = await ada.page.context().newCDPSession(ada.page)
    const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(start.x, start.y) })
    await expect(ada.page.locator('[data-hand-card][data-lifting="true"]')).toHaveCount(1)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.x + 16, start.y) })
    await expect(ada.page.locator('[data-hand-card][data-carried="true"]')).toHaveCount(1)
    release()
    await expect(first.locator('[data-texture]')).toHaveCount(0)
    const dx = Math.round(step * 1.2)
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(start.x + 16 + ((dx - 16) * i) / 8, start.y) })
      await ada.page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()

    await expect.poll(order).toEqual([before[1], before[0], before[2]])
  })
})


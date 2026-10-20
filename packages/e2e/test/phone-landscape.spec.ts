import { join } from '../support/api.js'
import type { Device } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A phone laid on the table (#716, L62, beslut A): the portrait column stretched out showed not one
// card of the hand without scrolling, and the fixed foot lay over the top of the cards. In a low,
// wide window the counters and the piles stand in a narrow column on the left and the hand has the
// rest, its cards sized by the window's height — on /play and on /online, which draws the same
// surface for a seat on a phone.
const whole = `(() => {
  const foot = document.querySelector('.byd-phone-foot')
  const floor = foot && getComputedStyle(foot).position === 'fixed' ? foot.getBoundingClientRect().top : innerHeight
  return [...document.querySelectorAll('[data-hand-card]')].map((c) => c.getBoundingClientRect())
    .filter((b) => b.top >= 0 && b.bottom <= floor && b.left >= 0 && b.right <= innerWidth).length
})()`

for (const device of [
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true },
  { name: 'phone-landscape-small', viewport: { width: 740, height: 360 }, hasTouch: true, isMobile: true },
] satisfies Device[]) {
  test.describe(`a phone on its side at ${device.viewport.width} × ${device.viewport.height} (#716)`, () => {
    for (const view of ['play', 'online'] as const) {
      test(`/${view} shows whole cards of the hand without scrolling`, async ({ tableOf, open, host, request }) => {
        const table = await tableOf({ players: 4, cards: 6, copies: 2 })
        const dealer = await host(table)
        await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 5 }])
        const seat = await join(request, table, { name: 'Di', seat: 'A' })
        const { page } = await open(device, `${view === 'play' ? seat.playUrl : seat.onlineUrl}&lang=sv`)
        await expect(page.locator('[data-hand-card]')).toHaveCount(5)
        expect(await page.evaluate('window.scrollY')).toBe(0)
        expect(await page.evaluate(whole)).toBeGreaterThanOrEqual(1)
        // Nothing goes sideways: the two columns are the window's width and no more.
        expect(await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')).toBe(0)
      })
    }
  })
}

// The head at 360 and 320 keeps one row (#716, beslut H1): «Ångra» and «Flagga» are drawn as their icons,
// named as before, so «Ut…» no longer drops to a line of its own.
for (const width of [360, 320]) {
test(`the head of the hand keeps one row at ${width} (#716)`, async ({ tableOf, open, host, request }) => {
  const table = await tableOf({ players: 4, cards: 6, copies: 5 })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 25 }])
  const seat = await join(request, table, { name: 'Spelaren med ett långt namn', seat: 'A' })
  const { page } = await open({ name: `phone-${width}`, viewport: { width, height: 640 }, hasTouch: true, isMobile: true }, `${seat.playUrl}&lang=sv`)
  await expect(page.locator('[data-hand-card]')).toHaveCount(25)
  const head = (await page.locator('.byd-player > header').boundingBox())!
  expect(head.height).toBeLessThanOrEqual(60)
  await expect(page.getByRole('button', { name: 'Ångra' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Flagga' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Ut…/ })).toBeVisible()
  for (const name of ['Ångra', 'Flagga']) {
    const b = (await page.getByRole('button', { name }).boundingBox())!
    expect({ [name]: b.width >= 44 && b.height >= 44 }).toEqual({ [name]: true })
  }
})
}

import { tableWithRules } from '../support/api.js'
import { expect, test } from '../support/test.js'

// A card played at 320 × 568 without scrolling (#484 fynd 11, beslut B, prototyp 28). The first play
// button stood 219 px under the screen's edge there, on `/play` and on `/online` alike, which shows
// a phone the player's surface. The bar #483 put at the foot for «Regler» also carries the chosen
// card's first target and «Spela…», so a thumb reaches them at any height; «Regler» keeps its name
// and at 320 is drawn as a book.
test('plays the chosen card from the bar at the foot, at 320 × 568, without scrolling', async ({ request, player, host }) => {
  const table = await tableWithRules(request, { players: 2 })
  const seat = table.seats[0]!
  const ada = await player(table, { name: 'Ada', seat, device: { name: 'phone', viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true } })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: `hand:${seat}`, count: 3 }])
  await expect(ada.page.locator('.byd-strip[data-hand] [data-hand-card]')).toHaveCount(3)
  const foot = ada.page.locator('.byd-phone-foot')
  const target = foot.locator('button[data-zone]').first()
  await expect(target).toBeVisible()
  await expect(foot.getByRole('button', { name: /…$/ })).toBeVisible()
  await expect(foot.getByRole('button', { name: 'Rules', exact: true })).toBeVisible()
  const fits = await ada.page.evaluate(() => {
    const b = document.querySelector('.byd-phone-foot button[data-zone]')!.getBoundingClientRect()
    return { scrolled: window.scrollY, inside: b.top >= 0 && b.bottom <= window.innerHeight, h: Math.round(b.height) }
  })
  expect(fits).toEqual({ scrolled: 0, inside: true, h: fits.h })
  expect(fits.h).toBeGreaterThanOrEqual(44)
  await target.click()
  await expect(ada.page.locator('.byd-strip[data-hand] [data-hand-card]')).toHaveCount(2)
})

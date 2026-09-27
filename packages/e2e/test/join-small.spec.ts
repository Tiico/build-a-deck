import { expect, test } from '../support/test.js'

// The seat picker on the smallest phone the product promises (#483, fynd 4; L12). The pills hang
// off the felt's edges by `--byd-seat-hang-y`, outside the box the page lays out, so at 320 × 568
// the north seat stood over «Plats … vald» and the south one over «Ditt namn».
test('keeps every seat clear of the words above and below the table at 320 × 568', async ({ tableOf, open }) => {
  const table = await tableOf({ players: 4 })
  const { page } = await open({ name: 'small phone', viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true }, `/join?code=${table.code}`)
  const seats = page.locator('.byd-join-table button')
  await expect(seats.first()).toBeVisible()
  const overlaps = await page.evaluate(() => {
    const pills = [...document.querySelectorAll<HTMLElement>('.byd-join-table button')].map((el) => ({ what: el.textContent?.trim() ?? '', box: el.getBoundingClientRect() }))
    const table = document.querySelector('.byd-join-table')!
    // Everything with words or a control of its own outside the table.
    const others = [...document.querySelectorAll<HTMLElement>('.byd-join :is(p, label, input, button, strong, h1, h2, span)')]
      .filter((el) => !table.contains(el) && el.checkVisibility() && el.getBoundingClientRect().height > 0)
      .map((el) => ({ what: (el.textContent ?? el.tagName).trim().slice(0, 24), box: el.getBoundingClientRect() }))
    const cross = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    return pills.flatMap((p) => others.filter((o) => cross(p.box, o.box)).map((o) => `${p.what} over ${o.what}`))
  })
  expect(overlaps).toEqual([])
})

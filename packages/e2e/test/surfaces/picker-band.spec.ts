import { expect, test } from '../../support/test.js'

// The seat picker reads from the top down: who you are joining, then the table right under it
// (#937). The page is a grid of three rows and the felt's row takes whatever height the phone has
// to spare. The felt used to be centred down that row, so on a 390 × 844 phone it stood in the
// middle of a band of nothing — 83 px of it between the header and the north seat with four
// seats, 48 px with six — while a 320 × 568 phone, with nothing to spare, drew the same page with
// the grid's own spacing. The felt now hangs from the top of its row and the spare height lies
// between the table and the form, which stays at the foot.
//
// What is measured is the air between the header's last line and the first thing the felt draws
// — the north seat's pill, which hangs off the felt's edge, or the wood rim round the felt — in the
// built app. The grid's gap and the felt's margin less the pill's hang come to 30 px, and that is
// the spacing every phone gets; a few pixels more are allowed for a face's line height.
const SPACING = 30
const SLACK = 10

for (const [width, height] of [[390, 844], [320, 568]] as const) {
  for (const players of [4, 6]) {
    test(`no band between the header and the felt at ${width} × ${height}, ${players} seats`, async ({ tableOf, open }) => {
      const table = await tableOf({ players })
      const { page } = await open({ name: 'phone', viewport: { width, height }, hasTouch: true, isMobile: true }, `/${table.code}?lang=sv`)
      await expect(page.locator('.byd-join-table button')).toHaveCount(players)
      const band = await page.evaluate(() => {
        const header = document.querySelector('.byd-join > header')!.getBoundingClientRect().bottom
        const felt = document.querySelector<HTMLElement>('.byd-join-table')!
        // The rim is the felt's box-shadow spread, outside the box the page lays out.
        const rim = parseFloat(getComputedStyle(felt).boxShadow.match(/0px 0px 0px (\d+)px/)?.[1] ?? '0')
        const pills = [...felt.querySelectorAll('button')].map((b) => b.getBoundingClientRect().top)
        return Math.min(felt.getBoundingClientRect().top - rim, ...pills) - header
      })
      console.log(`${width} × ${height}, ${players} seats: ${Math.round(band)} px`)
      expect(band, 'the felt stands clear of the header').toBeGreaterThanOrEqual(SPACING - SLACK)
      expect(band, 'and right under it').toBeLessThanOrEqual(SPACING + SLACK)
    })

    // The band is not closed by packing the whole page upwards: that would carry «Sätt dig» up and
    // down with the felt's size, and #42 left it where the thumb is whatever the table seats. The
    // form ends where the page's own padding begins, on a page that fits and on one that scrolls.
    test(`the form stays at the foot at ${width} × ${height}, ${players} seats`, async ({ tableOf, open }) => {
      const table = await tableOf({ players })
      const { page } = await open({ name: 'phone', viewport: { width, height }, hasTouch: true, isMobile: true }, `/${table.code}?lang=sv`)
      await expect(page.locator('.byd-join-table button')).toHaveCount(players)
      const gap = await page.evaluate(() => {
        const main = document.querySelector<HTMLElement>('.byd-join')!
        const form = main.querySelector('form')!
        return main.getBoundingClientRect().bottom - parseFloat(getComputedStyle(main).paddingBottom) - form.getBoundingClientRect().bottom
      })
      expect(Math.abs(gap), 'the form ends at the foot of the page').toBeLessThan(1)
    })
  }
}

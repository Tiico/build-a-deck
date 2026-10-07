import { expect, test } from '../../support/test.js'

// The seat picker reads from the top down: who you are joining, then the table right under it
// (#937). The page is a grid of three rows and the felt's row used to take whatever height the
// phone had to spare, so on a 390 × 844 phone the felt stood in the middle of a band of nothing,
// 109 px of it between the header and the north seat, while a 320 × 568 phone drew the same page
// with the grid's own spacing.
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
  }
}

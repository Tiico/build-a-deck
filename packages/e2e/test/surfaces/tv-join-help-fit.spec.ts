import { withQuery } from '../../support/api.js'
import { DESK, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The way in on the room's television (#1343): the host on its own line, and under it the code, the
// square and the help's «?» on one line (L32, #305, #1290). At 1280 × 800 the three did not fit the
// column's width, and the «?» stood alone on a line of its own under the code. The «?» has its
// place on the code's line, at every width a television or a laptop standing in for one has, in
// both languages, and again in a face as wide as the one a Linux machine falls back to (memory:
// browser tests must not pin Mac pixels); and the code and the square keep their size for it,
// since the television is bound by its height and its words are read from the sofa (K26).
const LAPTOP: Device = { name: 'laptop', viewport: { width: 1024, height: 768 } }
const WIDE_FACE = "*, *::before, *::after { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

for (const device of [LAPTOP, SMALL_TV, DESK, TV]) {
  for (const lang of ['sv', 'en'] as const) {
    test(`the help's «?» stands on the room code's line at ${device.viewport.width}, ${lang}`, async ({ table, open }) => {
      const { page } = await open(device, withQuery(table.tvUrl, `lang=${lang}`))
      await expect(page.locator('.byd-tv-join strong')).toHaveText(table.code)
      await expect(page.locator('.byd-tv-join .byd-help-ask')).toBeVisible()

      for (const face of ['own', 'wide'] as const) {
        if (face === 'wide') await page.addStyleTag({ content: WIDE_FACE })
        await page.evaluate(() => document.fonts.ready)
        const row = await page.evaluate(() => {
          const aside = document.querySelector('[data-tv] > aside')!
          const cs = getComputedStyle(aside)
          const box = aside.getBoundingClientRect()
          const rect = (selector: string) => {
            const r = document.querySelector(selector)!.getBoundingClientRect()
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
          }
          return {
            left: box.left + parseFloat(cs.paddingLeft),
            right: box.right - parseFloat(cs.paddingRight),
            code: rect('.byd-tv-join strong'),
            square: rect('.byd-tv-join .byd-qr'),
            ring: rect('.byd-tv-join .byd-help-ask > span'),
            codeSize: parseFloat(getComputedStyle(document.querySelector('.byd-tv-join strong')!).fontSize),
          }
        })
        const where = `${device.viewport.width} ${lang} ${face}`
        const r = Math.round
        console.log(`${where}: column ${r(row.left)}–${r(row.right)}, code ${r(row.code.left)}–${r(row.code.right)} × ${r(row.code.top)}–${r(row.code.bottom)}, square ${r(row.square.left)}–${r(row.square.right)}, ring ${r(row.ring.left)}–${r(row.ring.right)} × ${r(row.ring.top)}–${r(row.ring.bottom)}`)
        // The code and the square keep the size they were given: 40 px and 52 px.
        expect(row.codeSize, `the code's size in the ${face} face`).toBe(40)
        expect(r(row.square.width), `the square's size in the ${face} face`).toBe(52)
        // The «?» on the code's line, after the square: its ring's middle within the code's height.
        const middle = (row.ring.top + row.ring.bottom) / 2
        expect(middle, `the «?» on the code's line at ${where}`).toBeGreaterThan(row.code.top)
        expect(middle, `the «?» on the code's line at ${where}`).toBeLessThan(row.code.bottom)
        expect(row.square.left, `the square after the code at ${where}`).toBeGreaterThanOrEqual(row.code.right)
        expect(row.ring.left, `the «?» after the square at ${where}`).toBeGreaterThanOrEqual(row.square.right)
        // And the line stands inside the column.
        expect(row.code.left, `the code inside the column at ${where}`).toBeGreaterThanOrEqual(row.left - 0.5)
        expect(row.ring.right, `the «?» inside the column at ${where}`).toBeLessThanOrEqual(row.right + 0.5)
      }
    })
  }
}

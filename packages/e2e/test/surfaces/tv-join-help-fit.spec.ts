import { withQuery } from '../../support/api.js'
import { DESK, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The way in on the room's television (#1343, beställarens beslut A 2026-10-25): the help's «?»
// stands on the row's own heading, «Öppna på telefonen ?», at every width, and the code and the
// square have their line under the host to themselves. Before, the «?» stood after the square, and
// at 1024 and 1280, where the stage is on its 360 px floor and the foot has 320 px, the code (237),
// the square (52), the ring (36) and their two gaps needed 361 px: the «?» stood alone on a line of
// its own under the code.
//
// Measured at every width a television or a laptop standing in for one has, in both languages, and
// again in a face as wide as the one a Linux machine falls back to (memory: browser tests must not
// pin Mac pixels). The code is left out of the wide face: it is drawn in a fixed-width face on every
// machine (room-code-face.spec.ts), and every such face advances 0.6 em (tv-address-fit.spec.ts).
// The code and the square keep their size, since the television is read from the sofa (K26).
const LAPTOP: Device = { name: 'laptop', viewport: { width: 1024, height: 768 } }
const NOT_CODE = ':not(.byd-tv-join strong)'
const WIDE_FACE = `*${NOT_CODE}, *${NOT_CODE}::before, *${NOT_CODE}::after { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }`

for (const device of [LAPTOP, SMALL_TV, DESK, TV]) {
  for (const lang of ['sv', 'en'] as const) {
    test(`the help's «?» stands on the way in's heading at ${device.viewport.width}, ${lang}`, async ({ table, open }) => {
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
          // The heading's words, read off the text's own box: the span is as wide as its line.
          const words = (() => {
            const range = document.createRange()
            range.selectNodeContents(document.querySelector('.byd-tv-join [data-join-head] > span')!)
            const r = range.getBoundingClientRect()
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
          })()
          return {
            left: box.left + parseFloat(cs.paddingLeft),
            right: box.right - parseFloat(cs.paddingRight),
            words,
            head: rect('.byd-tv-join [data-join-head]'),
            headLine: rect('.byd-tv-join [data-join-head] > span'),
            address: rect('.byd-tv-join [data-address]'),
            code: rect('.byd-tv-join strong'),
            square: rect('.byd-tv-join .byd-qr'),
            ring: rect('.byd-tv-join .byd-help-ask > span'),
            codeSize: parseFloat(getComputedStyle(document.querySelector('.byd-tv-join strong')!).fontSize),
          }
        })
        const where = `${device.viewport.width} ${lang} ${face}`
        const r = Math.round
        console.log(`${where}: column ${r(row.left)}–${r(row.right)}, heading ${r(row.words.left)}–${r(row.words.right)} × ${r(row.words.top)}–${r(row.words.bottom)}, ring ${r(row.ring.left)}–${r(row.ring.right)} × ${r(row.ring.top)}–${r(row.ring.bottom)}, code ${r(row.code.left)}–${r(row.code.right)}, square ${r(row.square.left)}–${r(row.square.right)}`)
        // The code and the square keep the size they were given: 40 px and 52 px.
        expect(row.codeSize, `the code's size in the ${face} face`).toBe(40)
        expect(r(row.square.width), `the square's size in the ${face} face`).toBe(52)
        // The «?» on the heading's line, right after its words, and above the host and the code.
        const middle = (row.ring.top + row.ring.bottom) / 2
        expect(middle, `the «?» on the heading's line at ${where}`).toBeGreaterThan(row.words.top)
        expect(middle, `the «?» on the heading's line at ${where}`).toBeLessThan(row.words.bottom)
        expect(row.ring.left - row.words.right, `the «?» beside the heading's words at ${where}`).toBeGreaterThanOrEqual(0)
        expect(row.ring.left - row.words.right, `the «?» beside the heading's words at ${where}`).toBeLessThanOrEqual(16)
        expect(row.ring.bottom, `the «?» above the host at ${where}`).toBeLessThanOrEqual(row.address.top)
        // And the ring costs the heading no height: the line is as tall as its words, since every
        // pixel the foot grows comes off the stage's card, which stands on K26's 24 px of body text
        // at 1920 × 1080 (tv-brand.spec.ts) with less than a pixel to spare on Linux.
        expect(row.head.height, `the heading's line with its «?» at ${where}`).toBeLessThanOrEqual(row.headLine.height + 0.5)
        // The code and the square on one line under the host, the square after the code.
        const squareMiddle = (row.square.top + row.square.bottom) / 2
        expect(squareMiddle, `the square on the code's line at ${where}`).toBeGreaterThan(row.code.top)
        expect(squareMiddle, `the square on the code's line at ${where}`).toBeLessThan(row.code.bottom)
        expect(row.square.left, `the square after the code at ${where}`).toBeGreaterThanOrEqual(row.code.right)
        // And all of it inside the column.
        for (const [what, at] of [['heading', row.words], ['«?»', row.ring], ['code', row.code], ['square', row.square]] as const) {
          expect(at.left, `the ${what} inside the column at ${where}`).toBeGreaterThanOrEqual(row.left - 0.5)
          expect(at.right, `the ${what} inside the column at ${where}`).toBeLessThanOrEqual(row.right + 0.5)
        }
      }
    })
  }
}

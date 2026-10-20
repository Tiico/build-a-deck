import { SMALL_TV, TV } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The room's address on the television (#675, beslut C 2026-10-06): the host on a line of its own
// at 24 px and `/KOD` under it at 40. Here the host is the stack's, `127.0.0.1:port`; on the box it
// is `deck.ockelberg.com`, which is longer, so the box's name is what is measured — written into
// the line the page drew — and with a seventh more width again, which is what a Linux machine's
// fallback face costs against this Mac's (memory: felt measurements must not pin Mac pixels).
//
// What the address costs is paid by INSPEKTION, the card panel under it, which the prototype
// measured at 227 px at 1280 × 800 for this variant against 265 before it.
const BOX = 'deck.ockelberg.com'

for (const device of [SMALL_TV, TV]) {
  test(`the address fits its column at ${device.viewport.width}, a seventh wider too`, async ({ table, open }) => {
    const { page } = await open(device, `${table.tvUrl}&lang=sv`)
    const address = page.locator('.byd-tv-address')
    await expect(address).toBeVisible()
    await address.evaluate((el, box) => (el.textContent = box), BOX)
    const fit = await page.evaluate(() => {
      const row = document.querySelector('.byd-tv-join')!
      const cs = getComputedStyle(row)
      const room = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const width = (el: Element) => {
        const range = document.createRange()
        range.selectNodeContents(el)
        return Math.max(...[...range.getClientRects()].map((r) => r.width))
      }
      const host = document.querySelector('.byd-tv-address')!
      const code = document.querySelector('.byd-tv-join strong')!
      const qr = document.querySelector('.byd-tv-join img.byd-qr')
      // The code shares its line with the square, as it always has.
      const codeLine = code.getBoundingClientRect().width + (qr ? qr.getBoundingClientRect().width + parseFloat(cs.columnGap || '0') : 0)
      const inspect = document.querySelector('.byd-tv-inspect')!.getBoundingClientRect().height
      return { room, host: width(host), codeLine, lines: host.getClientRects().length, inspect, sameLine: !qr || Math.abs(qr.getBoundingClientRect().top - code.getBoundingClientRect().top) < code.getBoundingClientRect().height }
    })
    expect(fit.lines, 'the host is one line').toBe(1)
    expect(fit.host * 1.15, `the host (${Math.round(fit.host)} px) in a column of ${fit.room} px`).toBeLessThanOrEqual(fit.room)
    // The code is set in a monospaced face, and every monospaced face this meets — SF Mono, Menlo,
    // DejaVu Sans Mono, Liberation Mono — advances 0.6 em a character, so its line is the same
    // width on any machine and is held to the column as it is, with a few pixels to spare.
    expect(fit.codeLine, `the code and the square (${Math.round(fit.codeLine)} px) in ${fit.room} px`).toBeLessThanOrEqual(fit.room - 8)
    expect(fit.sameLine, 'the square stands beside the code').toBe(true)
    console.log(`${device.viewport.width}: host ${Math.round(fit.host)} px, code line ${Math.round(fit.codeLine)} px, column ${fit.room} px, INSPEKTION ${Math.round(fit.inspect)} px`)
    // INSPEKTION keeps the room the prototype measured for it, give or take a face's line height.
    if (device === SMALL_TV) expect(fit.inspect, 'INSPEKTION at 1280 × 800').toBeGreaterThanOrEqual(215)
  })
}

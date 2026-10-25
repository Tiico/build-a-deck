import { tableWithRules, withQuery } from '../../support/api.js'
import { DESK, SMALL_TV, TV, type Device } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The game's name in the foot under the room's stage (#1340): the brand's line with the owner's way
// back at its end, and the game's name with «Regler» beside it under that. On an ended table at
// 1280 × 800 the way back and «Regler» stood past the column's right edge and were cut, and the
// name broke over two lines under them. Every part of those two lines has to stand inside the
// column, at the widths a laptop standing in for the television has and at 1920 × 1080, where the
// foot stands in two columns and the way back had room for an arrow and one letter; and again in a
// face as wide as the one a Linux machine falls back to (memory: browser tests must not pin Mac
// pixels).
const LAPTOP: Device = { name: 'laptop', viewport: { width: 1024, height: 768 } }
const WIDE_FACE = "*, *::before, *::after { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

for (const device of [LAPTOP, SMALL_TV, DESK, TV]) {
  for (const lang of ['sv', 'en'] as const) {
    test(`the game's name and «Regler» stand inside the column at ${device.viewport.width}, ${lang}, ended`, async ({ request, open, host }) => {
      const table = await tableWithRules(request, { players: 2 })
      const hosting = await host(table)
      await hosting.send([{ v: 'session.end' } as never])
      const { page } = await open(device, withQuery(table.tvUrl, `lang=${lang}`))
      await expect(page.locator('[data-join-ended]')).toBeVisible()
      await expect(page.locator('.byd-tv-brand [data-editor-way]')).toBeVisible()
      await expect(page.locator('.byd-tv-head h1')).toContainText('Skogens herrar')
      await expect(page.locator('.byd-tv-head .byd-rules-open')).toBeVisible()

      for (const face of ['own', 'wide'] as const) {
        if (face === 'wide') await page.addStyleTag({ content: WIDE_FACE })
        await page.evaluate(() => document.fonts.ready)
        const fit = await page.evaluate(() => {
          const aside = document.querySelector('[data-tv] > aside')!
          const cs = getComputedStyle(aside)
          const box = aside.getBoundingClientRect()
          const left = box.left + parseFloat(cs.paddingLeft)
          const right = box.right - parseFloat(cs.paddingRight)
          // Every box on the two lines, nested ones too: «Regler» is a button inside a drawer that
          // draws no box of its own. A box with no size is not on the screen.
          const parts = [...document.querySelectorAll('.byd-tv-name .byd-tv-brand *, .byd-tv-name .byd-tv-head *')]
          const past = parts
            .map((el) => {
              const r = el.getBoundingClientRect()
              return { what: `${el.tagName.toLowerCase()} ${el.textContent?.trim() ?? ''}`.trim(), left: Math.round(r.left), right: Math.round(r.right), width: r.width }
            })
            .filter((p) => p.width > 0 && (p.right > right + 0.5 || p.left < left - 0.5))
            .map(({ width: _, ...p }) => p)
          // «Regler» says its whole word: a button is never the part that gives way.
          const button = document.querySelector<HTMLElement>('.byd-tv-head .byd-rules-open')!
          const h1 = document.querySelector<HTMLElement>('.byd-tv-head h1')!
          const name = h1.querySelector<HTMLElement>(':scope > span')!
          const lines = (el: Element) => {
            const range = document.createRange()
            range.selectNodeContents(el)
            return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size
          }
          // How wide the name is on one line, and whether its block has that much room for it: the
          // whole column where the foot stands in one, the right-hand part where it stands in two.
          const room = document.querySelector('.byd-tv-name')!.getBoundingClientRect().width
          const oneLine = (el: HTMLElement) => {
            const was = el.style.whiteSpace
            el.style.whiteSpace = 'nowrap'
            // Read off the text's own box: an inline heading has no scroll width of its own.
            const range = document.createRange()
            range.selectNodeContents(el)
            const width = range.getBoundingClientRect().width
            el.style.whiteSpace = was
            return width
          }
          return {
            left,
            right,
            past,
            nameLines: lines(name),
            headingLines: lines(h1),
            nameFits: oneLine(name) <= room,
            headingFits: oneLine(h1) <= room,
            buttonCut: button.scrollWidth > button.clientWidth,
            // The way back keeps a few letters of the name, five of its em, or the block's width.
            way: (() => {
              const way = document.querySelector<HTMLElement>('.byd-tv-brand [data-editor-way]')!
              const block = document.querySelector('.byd-tv-name')!.getBoundingClientRect().width
              return { width: Math.round(way.getBoundingClientRect().width), floor: Math.floor(Math.min(block, 5 * parseFloat(getComputedStyle(way).fontSize))) }
            })(),
          }
        })
        console.log(`${device.viewport.width} ${lang} ${face}: column ${Math.round(fit.right - fit.left)} px, way back ${fit.way.width} px, heading on ${fit.headingLines} line(s) (fits: ${fit.headingFits}), name on ${fit.nameLines} (fits: ${fit.nameFits})`)
        expect(fit.past, `past the column [${Math.round(fit.left)}, ${Math.round(fit.right)}] in the ${face} face`).toEqual([])
        expect(fit.way.width, `the way back in the ${face} face`).toBeGreaterThanOrEqual(fit.way.floor)
        expect(fit.buttonCut, `«Regler» whole in the ${face} face`).toBe(false)
        // The heading breaks only where the column cannot hold it on one line on its own, never to
        // make room for «Regler» beside it, which steps onto the next line instead; and where it does break,
        // it breaks before the version and not inside the game's name.
        if (fit.headingFits) expect(fit.headingLines, `the heading in the ${face} face`).toBe(1)
        if (fit.nameFits) expect(fit.nameLines, `the game's name in the ${face} face`).toBe(1)
      }
    })
  }
}

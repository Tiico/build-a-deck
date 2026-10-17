import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The pen that opens a numbered list stood against its numbers in the margin, so «12.» and ✎ read
// as one thing (#973). The pen keeps at least one rung of the spacing ladder clear of the widest
// number, with one point and with twelve. A ::marker has no rectangle of its own, so its left edge
// is the point's text start less the marker's text set in the point's own font — which is how
// Chromium hangs an outside marker against the point.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

for (const count of [1, 12]) {
  test(`the pen keeps a rung clear of a numbered list's numbers with ${count} point(s) (#973)`, async ({ page }) => {
    await logIn(page.request)
    const doc = gameDoc({ name: 'Skogens herrar', players: 2 }) as ReturnType<typeof gameDoc> & { rules?: unknown }
    doc.rules = {
      title: 'Skogens herrar',
      blocks: [
        { kind: 'heading', id: 'h1', level: 1, text: 'En tur' },
        { kind: 'list', id: 'l1', ordered: true, items: Array.from({ length: count }, (_, i) => `Steg ${i + 1}.`) },
      ],
    }
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await page.getByRole('tab', { name: 'Regler' }).click()
    const list = page.locator('[data-rulebook] ol')
    await list.hover()
    const pen = page.getByRole('button', { name: /^Redigera listan/ })
    await expect(pen).toBeVisible()

    const gap = await page.evaluate(() => {
      const pen = document.querySelector('.byd-rules-pen')!.getBoundingClientRect()
      const items = [...document.querySelectorAll('[data-rulebook] ol > li')]
      const ink = document.createElement('canvas').getContext('2d')!
      const lefts = items.map((li, i) => {
        ink.font = getComputedStyle(li).font
        return li.getBoundingClientRect().left - ink.measureText(`${i + 1}. `).width
      })
      return Math.min(...lefts) - pen.right
    })
    expect(gap).toBeGreaterThanOrEqual(8)
  })
}

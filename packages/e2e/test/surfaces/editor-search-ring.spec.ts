import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// One ring round the table's search field (#659). The field is a box that holds the filter chips
// and the input. With the focus in it the box's edge lit, and the input inside drew the editor's
// field ring as well — an inset 2 px of the lighter blue — so the field stood in a ring inside a
// ring, from the chip's edge to the field's. Now the box draws the editor's field ring inside
// itself (#34), and the input draws none.
//
// Measured on what is painted, along a line across the middle of the field: the ring's colour is
// there (so the focus is still said), in two runs, and both lie on the box's own left and right
// edges. The input's own ring stood inside, starting at the chip or the field's padding.
const RING = [0x9c, 0xc6, 0xff]

for (const width of [1024, 1280]) {
  test.describe(`the table's search field at ${width} (#659)`, () => {
    test.use({ viewport: { width, height: 800 }, locale: 'sv-SE' })

    test('draws one ring with the focus in it, a chip or none', async ({ page }) => {
      await logIn(page.request)
      const doc = gameDoc({ name: 'Ringen', cards: 4 })
      doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: i % 2 ? 'plats' : 'varelse' } }))
      const project = await makeProjectOf(page.request, doc)
      await page.goto(project.editorUrl)
      await page.locator('#byd-editor-tab-table').click()
      const field = page.getByRole('searchbox', { name: 'Sök i alla fält' })
      await field.click()

      const painted = async () => {
        await page.mouse.move(0, 0)
        const box = (await page.locator('.byd-data-filter').boundingBox())!
        const shot = await page.screenshot({ clip: box })
        // The chips' own faces are left out: their text and their × are drawn on the marking's blue,
        // and anti-aliased in the machine's font they pass near the ring's colour on Linux. A ring
        // round the input would lie outside them, beside the chip or at the field's padding.
        const chips = await page.locator('.byd-data-filter > .byd-chip').evaluateAll((els, left) => els.map((el) => { const r = el.getBoundingClientRect(); return [r.left - left, r.right - left] }), box.x)
        return page.evaluate(
          async ({ data, across, ring, chips }) => {
            const img = new Image()
            img.src = `data:image/png;base64,${data}`
            await img.decode()
            const canvas = new OffscreenCanvas(img.width, img.height)
            const g = canvas.getContext('2d')!
            g.drawImage(img, 0, 0)
            // The middle row of the shot, which is in device pixels.
            const line = g.getImageData(0, Math.floor(img.height / 2), img.width, 1).data
            const near = (at: number, c: number[]) => Math.abs(line[at]! - c[0]!) + Math.abs(line[at + 1]! - c[1]!) + Math.abs(line[at + 2]! - c[2]!) < 40
            // The runs of the ring's colour along it, as [first, last] in CSS px from the box's left.
            const runs: [number, number][] = []
            const px = img.width / across
            for (let x = 0; x < img.width; x++) {
              if (chips.some(([a, b]) => x / px >= a! && x / px <= b!)) continue
              if (!near(x * 4, ring)) continue
              const last = runs[runs.length - 1]
              if (last && last[1] === x - 1) last[1] = x
              else runs.push([x, x])
            }
            return { runs: runs.map(([a, b]) => [a / px, b / px]), width: across }
          },
          { data: shot.toString('base64'), across: box.width, ring: RING, chips },
        )
      }

      // One ring: a run at the box's left edge and one at its right edge, and nothing between.
      const oneRing = (drawn: { runs: number[][]; width: number }, where: string) => {
        expect(drawn.runs.length, where).toBe(2)
        expect(drawn.runs[0]![0]!, where).toBeLessThanOrEqual(1.5)
        expect(drawn.runs[1]![1]!, where).toBeGreaterThanOrEqual(drawn.width - 2.5)
      }
      oneRing(await painted(), 'with no chip')

      await page.keyboard.type('typ:v')
      await page.keyboard.press('Enter')
      await expect(page.getByRole('button', { name: 'Ta bort filtret typ: varelse', exact: true })).toBeVisible()
      await expect(field).toBeFocused()
      oneRing(await painted(), 'with a chip')
    })
  })
}

import type { Page } from '@playwright/test'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { logIn, makeProjectOf, startTable } from '../../support/api.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// The template's two columns at the editor's two desk sizes (#736, beslut 2026-10-06 on the
// prototypes in #917), with a table running so the band «Bordet kör» takes its share of the height.
//
// - The text layer's panel, variant C: the placement's nine squares in a column of their own with
//   «Anpassning» and «Finjustering» beside them, and the field the layer shows on a line under the
//   panel's heading. It used to be 751 px in a column of 589–621, with «Anpassning» under the fold.
// - The back, variant A: «Färdiga baksidor» folded under the back's own layers, open only while the
//   back has none. It used to stand open above them and take 506 px of the column, so not one of
//   the back's four layers was in sight.
//
// Only rectangles are compared: what fits inside what, never a pixel count a Linux font would move.
// In both of the editor's languages, because the two are not the same length.

const NAMES = ['Ada', 'Bo', 'Cy']

async function atTheTemplate(page: Page, host: Fixtures['host'], doc = spelkortDoc(4)) {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  const table = await startTable(page.request, project.id)
  const seats = doc.setup.seats.slice(0, NAMES.length)
  const dealer = await host({ ...table, seats: doc.setup.seats })
  await dealer.send(seats.map((seat, i) => ({ v: 'seat.claim', seat, name: NAMES[i] }) as never))
  await page.goto(project.editorUrl)
  await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  // The band is part of what has to fit beside it.
  await expect(page.locator('.byd-editor-table-link')).toBeVisible()
}

for (const locale of ['sv-SE', 'en-GB'])
for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test.describe(`at ${width} × ${height} in ${locale} (#736)`, () => {
    test.use({ viewport: { width, height }, locale })
    const sv = locale === 'sv-SE'

    test('holds a text layer s panel in its column, the field under the heading and the placement beside its fitting', async ({ page, host }) => {
      await atTheTemplate(page, host)
      await page.locator('[data-layer="title"] .byd-layer-pick').click()
      const panel = page.locator('.byd-canvas-props')
      await expect(panel.getByRole('heading', { name: /title/i })).toBeVisible()
      await expect(panel.getByRole('region', { name: 'Text' })).toBeVisible()

      const drawn = await panel.evaluate((column) => {
        const box = (el: Element | null) => (el ? el.getBoundingClientRect().toJSON() as DOMRect : null)
        const visible = [...column.querySelectorAll('button, select, input, [role="radio"]')].filter((e) => e.getClientRects().length > 0)
        const last = visible.at(-1) ?? null
        const fit = [...column.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'shrink')) ?? null
        // How wide each fitting is written, in the select's own font: the box has to hold the
        // widest of them, its own padding and the arrow the browser draws at its end. A width of
        // text against a width of box, both in this machine's font, so a wider font on Linux
        // moves both sides.
        let fitNeeds = 0
        if (fit) {
          const style = getComputedStyle(fit)
          for (const option of fit.options) {
            const probe = document.createElement('span')
            probe.textContent = option.textContent ?? ''
            probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${style.font};letter-spacing:${style.letterSpacing}`
            document.body.append(probe)
            fitNeeds = Math.max(fitNeeds, probe.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth))
            probe.remove()
          }
        }
        const field = column.querySelector('.byd-props-bind select')
        return {
          column: box(column)!,
          over: column.scrollHeight - column.clientHeight,
          last: box(last),
          fit: box(fit),
          fitNeeds,
          pad: box(column.querySelector('.byd-props-pad')),
          field: box(field),
          firstSection: box(column.querySelector('.byd-props-sec')),
        }
      })
      // Nothing of the panel under the column's edge, and the column's edge inside the window.
      expect(drawn.over, 'pixels of the panel under the fold').toBeLessThanOrEqual(0)
      expect(drawn.last!.bottom).toBeLessThanOrEqual(drawn.column.bottom + 0.5)
      expect(drawn.column.bottom).toBeLessThanOrEqual(height + 0.5)
      // The field the layer shows, on a line of its own above the first section.
      expect(drawn.field, 'the field picker under the heading').not.toBeNull()
      expect(drawn.field!.bottom).toBeLessThanOrEqual(drawn.firstSection!.top + 0.5)
      await expect(panel.getByRole('region', { name: sv ? 'Innehåll' : 'Content' })).toHaveCount(0)
      // The nine squares in a column of their own, «Anpassning» beside them and whole.
      expect(drawn.fit!.left).toBeGreaterThanOrEqual(drawn.pad!.right)
      expect(drawn.fit!.top).toBeLessThan(drawn.pad!.bottom)
      expect(drawn.fit!.right).toBeLessThanOrEqual(drawn.column.right + 0.5)
      // The words plus the arrow's own room (Chromium draws it in about 20 px at the end).
      expect(drawn.fit!.width, '«Anpassning» holds its chosen words').toBeGreaterThanOrEqual(drawn.fitNeeds + 20)
    })

    test('shows every layer of the back, with the ready-made backs folded under them', async ({ page, host }) => {
      await atTheTemplate(page, host)
      await page.getByRole('radio', { name: sv ? 'Baksida' : 'Back', exact: true }).click()
      const column = page.locator('.byd-canvas-scroll')
      const gallery = page.getByRole('button', { name: sv ? /^Färdiga baksidor/ : /^Ready-made backs/ })
      await expect(gallery).toHaveAttribute('aria-expanded', 'false')
      const drawn = await column.evaluate((scroll) => {
        const s = scroll.getBoundingClientRect()
        const rows = [...scroll.querySelectorAll('[data-layer]')].map((r) => r.getBoundingClientRect().toJSON() as DOMRect)
        const head = scroll.querySelector('.byd-backs')!.getBoundingClientRect()
        return { bottom: s.bottom, rows, head: head.toJSON() as DOMRect, list: scroll.querySelectorAll('.byd-backs-list').length }
      })
      expect(drawn.rows.length).toBe(4)
      for (const row of drawn.rows) expect(row.bottom).toBeLessThanOrEqual(drawn.bottom + 0.5)
      // Under the layers, and closed.
      expect(drawn.head.top).toBeGreaterThanOrEqual(drawn.rows.at(-1)!.bottom - 0.5)
      expect(drawn.list).toBe(0)
      // Still the way to another back: one press opens it.
      await gallery.click()
      await expect(gallery).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('.byd-backs-list button')).not.toHaveCount(0)
    })

    test('stands the ready-made backs open on a back with no layers of its own, and folds them once one is laid down', async ({ page, host }) => {
      const doc = spelkortDoc(4)
      doc.template.faces['back'] = { base: [], variants: {} }
      await atTheTemplate(page, host, doc)
      await page.getByRole('radio', { name: sv ? 'Baksida' : 'Back', exact: true }).click()
      const gallery = page.getByRole('button', { name: sv ? /^Färdiga baksidor/ : /^Ready-made backs/ })
      await expect(gallery).toHaveAttribute('aria-expanded', 'true')
      const first = page.locator('.byd-backs-list button').first()
      await expect(first).toBeVisible()
      const box = (await first.boundingBox())!
      const column = (await page.locator('.byd-canvas-scroll').boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(column.y + column.height + 0.5)
      await first.click()
      await expect(page.locator('.byd-canvas-scroll [data-layer]')).not.toHaveCount(0)
      await expect(gallery).toHaveAttribute('aria-expanded', 'false')
    })
  })
}

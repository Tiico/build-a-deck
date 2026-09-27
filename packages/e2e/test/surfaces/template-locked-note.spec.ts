import { expect, test } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Why a locked layer did not move (#478, L15): the sentence stood at the stage's foot and was cut
// by it — 784 to 816 in a stage that ends at 800. It now stands where the canvas asks its other
// question, under the card, whole, at both of the editor's widths.
test.use({ locale: 'sv-SE' })

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`says a layer is locked where it can be read, at ${width} × ${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const doc = gameDoc({ name: 'Skogens herrar', cards: 2 }) as unknown as ProjectDoc
    const body = doc.template.faces['front']!.base.find((e) => e.id === 'body')!
    ;(body as { locked?: boolean }).locked = true
    await logIn(page.request)
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await expect(page.getByText('Skogens herrar').first()).toBeVisible()
    await page.locator('#byd-editor-tab-template').click()
    const box = (await page.locator('[data-drag="body"]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10)
    await page.mouse.up()
    const note = page.locator('.byd-canvas-locked')
    await expect(note).toContainText('är låst')
    await expect(note).toBeInViewport({ ratio: 1 })
    // Whole, and not cut by a box around it that ends before it does.
    const clipped = await note.evaluate((el) => {
      const r = el.getBoundingClientRect()
      for (let up = el.parentElement; up; up = up.parentElement) {
        const s = getComputedStyle(up)
        if (s.overflow === 'visible' && s.overflowY === 'visible') continue
        const c = up.getBoundingClientRect()
        if (r.bottom > c.bottom + 0.5 || r.top < c.top - 0.5) return up.className
      }
      return null
    })
    expect(clipped).toBeNull()
  })
}

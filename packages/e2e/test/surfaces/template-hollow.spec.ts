import { expect, test } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// A shape with no fill is its outline and nothing else (#478, L26): its box used to take the
// pointer over the whole of its inside, so a click on the band drawn under an outlined frame chose
// the frame. The inside of a hollow box now lets the pointer through to what is drawn there, and
// the outline is hit within half its line plus L26's own 2.4 mm.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

function withHollowFrame(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 2 }) as unknown as ProjectDoc
  const base = doc.template.faces['front']!.base
  base.push({ kind: 'shape', id: 'band', shape: 'rect', x: 10, y: 40, w: 43, h: 8, fill: '#3a4d7a' } as never)
  base.push({ kind: 'shape', id: 'outline', shape: 'rect', x: 3, y: 3, w: 57, h: 82, stroke: '#1c1c1c', strokeMm: 0.5 } as never)
  return doc
}

test('lets the pointer through the inside of a shape with no fill, and takes it on its outline', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withHollowFrame())
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  const outline = page.locator('[data-drag="outline"]')
  await expect(outline).toBeVisible()
  const band = (await page.locator('[data-drag="band"]').boundingBox())!
  const box = (await outline.boundingBox())!
  const topmost = (x: number, y: number) =>
    page.evaluate(([px, py]) => document.elementsFromPoint(px!, py!).map((el) => el.closest('[data-drag]')?.getAttribute('data-drag')).find(Boolean) ?? null, [x, y])

  expect(await topmost(band.x + band.width / 2, band.y + band.height / 2), 'the band under the hollow frame').toBe('band')
  expect(await topmost(box.x + 2, box.y + box.height / 2), 'the frame s own outline').toBe('outline')

  await page.mouse.click(band.x + band.width / 2, band.y + band.height / 2)
  await expect(page.locator('[data-drag="band"] .byd-drag-handle').first()).toBeVisible()
})

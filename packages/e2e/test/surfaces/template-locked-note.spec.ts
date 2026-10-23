import type { Page } from '@playwright/test'
import { expect, test } from '../../support/test.js'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Why a locked layer did not move (L15), and where that is said (#1181). It stood at the stage's
// foot and was cut by it (#478); then over the canvas' foot, where it covered the card row from the
// first press that only chose the layer until the layer was unlocked. It now stands on the card
// beside the layer, for a pull and not a press, and goes when it is put away.
test.use({ locale: 'sv-SE' })

async function openTemplate(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  const doc = gameDoc({ name: 'Skogens herrar', cards: 2 }) as unknown as ProjectDoc
  const base = doc.template.faces['front']!.base
  // The name in the card's upper half and the text reaching into its lower: one note opens
  // downwards and the other upwards, each across the card.
  for (const id of ['title', 'body']) (base.find((e) => e.id === id) as { locked?: boolean }).locked = true
  ;(base.find((e) => e.id === 'title') as { name?: string }).name = 'Kortnamn'
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('[data-drag="body"]')).toBeVisible()
}

const note = (page: Page) => page.locator('.byd-canvas-locked')

async function pull(page: Page, id: string) {
  const box = (await page.locator(`[data-drag="${id}"]`).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10, { steps: 3 })
  await page.mouse.up()
  return box
}

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`says a layer is locked beside it, and leaves the card row free, at ${width} × ${height}`, async ({ page }) => {
    await openTemplate(page, width, height)

    // A press that only chooses the layer is not an attempt to move it.
    const title = (await page.locator('[data-drag="title"]').boundingBox())!
    await page.mouse.click(title.x + title.width / 2, title.y + title.height / 2)
    await expect(page.locator('[data-layer="title"]')).toHaveAttribute('aria-selected', 'true')
    await expect(note(page)).toHaveCount(0)

    for (const [id, opens] of [['title', 'down'], ['body', 'up']] as const) {
      const layer = await pull(page, id)
      await expect(note(page)).toContainText('är låst')
      // Whole on the screen. Not ratio 1: the note is scaled by one over the zoom, and Chromium
      // answers 0,9999999 for a box that is all there.
      await expect(note(page)).toBeInViewport({ ratio: 0.999 })
      const at = (await note(page).boundingBox())!
      // At the layer's own edge, on the side the card goes on.
      if (opens === 'down') expect(at.y - (layer.y + layer.height)).toBeGreaterThanOrEqual(0)
      if (opens === 'down') expect(at.y - (layer.y + layer.height)).toBeLessThan(16)
      if (opens === 'up') expect(layer.y - (at.y + at.height)).toBeGreaterThanOrEqual(0)
      if (opens === 'up') expect(layer.y - (at.y + at.height)).toBeLessThan(16)
      expect(Math.abs(at.x + at.width / 2 - (layer.x + layer.width / 2))).toBeLessThan(2)

      // Whole, and not cut by a box around it that ends before it does.
      const clipped = await note(page).evaluate((el) => {
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

      // And the card row under the canvas answers its own buttons while the note stands.
      const covered = await page.locator('.byd-card-row button').evaluateAll((buttons) =>
        buttons.filter((b) => {
          const r = b.getBoundingClientRect()
          return !b.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2))
        }).length,
      )
      expect(covered).toBe(0)
    }

    // Put away from itself, and the hand is given back to the layer it was about.
    await note(page).getByRole('button', { name: 'Stäng' }).click()
    await expect(note(page)).toHaveCount(0)
    await expect(page.locator('[data-drag="body"]')).toBeFocused()
  })
}

// A locked layer is drawn in gold (L15), and stays gold when it is the one chosen: the chosen row's
// colour used to win over the lock's, so the one layer the designer was asking about lost the
// colour that says why it would not move.
test('draws the chosen layer’s lock in gold', async ({ page }) => {
  await openTemplate(page, 1280, 800)
  await page.locator('[data-layer="title"] .byd-layer-pick').click()
  await expect(page.locator('[data-layer="title"]')).toHaveAttribute('aria-selected', 'true')
  // Off the list, so it is the choice that is measured and not the hover, which was already gold.
  await page.mouse.move(1, 1)
  const ink = (id: string) => page.locator(`[data-layer="${id}"] .byd-layer-lock`).evaluate((el) => getComputedStyle(el).color)
  // Not vacuous: an open lock is drawn in another colour than a shut one.
  expect(await ink('frame')).not.toBe(await ink('body'))
  expect(await ink('title')).toBe(await ink('body'))
})

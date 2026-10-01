import { expect, test } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { zoomTo } from '../../support/zoom.js'

// A shape of the designer's own drawing on the canvas (#478, L26, L38): a real click on one of
// its points, on the dot between two points or on a handle deselected the shape — the points
// went away, the panel said «Välj ett lager …», and the focus fell to <body>. The keyboard never
// had the problem; the pointer does not have it now either.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

function withOwnShape(): ProjectDoc {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 2 }) as unknown as ProjectDoc
  doc.template.faces['front']!.base.push({
    kind: 'shape',
    id: 'banner',
    shape: 'rect',
    x: 10,
    y: 30,
    w: 40,
    h: 20,
    fill: '#3a4d7a',
    points: [
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 20 },
      { x: 0, y: 20 },
    ],
  } as never)
  return doc
}

test('keeps the shape chosen when its point, its mid-dot or a handle is clicked', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withOwnShape())
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await page.locator('[data-drag="banner"]').click()
  const point = page.locator('.byd-point[data-point="1"]')
  await expect(point).toBeVisible()

  await point.click()
  await expect(point, 'the point is still there after a click on it').toBeVisible()
  await expect(point).toBeFocused()

  const handle = page.locator('.byd-point-handle').first()
  if (await handle.count()) {
    await handle.click()
    await expect(point).toBeVisible()
  }

  const mid = page.locator('.byd-point-mid[data-mid="0"]')
  await mid.click()
  await expect(page.locator('.byd-point[data-point="1"]')).toBeVisible()
  await expect(page.locator('.byd-point:not(.byd-point-mid):not(.byd-point-handle)')).toHaveCount(5)
})

// The marks on the card are drawn in millimetres of card, so they shrank with the zoom: 18 px at
// «Passa in», 9 × 9 at 100 % and 5 × 5 at 50 % (#478). They keep their size in millimetres while
// that is a fingertip's worth of screen, and never go under 10 px.
test('keeps every handle and point at least 10 pixels wide at every zoom', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, withOwnShape())
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await page.locator('[data-drag="banner"]').click()
  await expect(page.locator('.byd-point[data-point="0"]')).toBeVisible()
  for (const percent of [100, 50]) {
    await zoomTo(page, percent)
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.byd-drag-handle, .byd-point')].map((el) => {
        const r = el.getBoundingClientRect()
        return { what: el.className, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 }
      }),
    )
    expect(sizes.length, `marks at ${percent} %`).toBeGreaterThan(0)
    expect(sizes.filter((s) => s.w < 10 || s.h < 10), `marks under 10 px at ${percent} %`).toEqual([])
  }
})

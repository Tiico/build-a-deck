import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../support/api.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// The canvas's size handles are a fingertip's target on a tablet (#565, L12's addition of
// 2026-09-29). They are drawn 15 px square at the zoom the card fits at, and a fingertip covers
// about 40: a press 8 px off the corner chose the card's background shape under it and moved it,
// and one 14 px off resized that shape instead. Driven with real touch points through the DevTools
// protocol, as a finger presses; a mouse keeps the small target it has always had.
test.use({ viewport: { width: 1280, height: 740 }, hasTouch: true })

type Box = { x: number; y: number; w: number; h: number }

async function press(page: Page, from: { x: number; y: number }, by: { x: number; y: number }): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  const point = (x: number, y: number) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) })
  for (let step = 1; step <= 10; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (by.x * step) / 10, from.y + (by.y * step) / 10) })
    await page.waitForTimeout(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

// The element as the template holds it, read off the box's own millimetres.
const mm = (page: Page, id: string) =>
  page.locator(`[data-drag="${id}"]`).evaluate((el): Box => {
    const s = (el as HTMLElement).style
    return { x: parseFloat(s.left), y: parseFloat(s.top), w: parseFloat(s.width), h: parseFloat(s.height) }
  })
const selected = (page: Page) => page.evaluate(() => document.querySelector('.byd-drag-handle')?.closest('[data-drag]')?.getAttribute('data-drag') ?? null)

async function openWith(page: Page, extra: Record<string, unknown>[] = [], coarse = true) {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Skogens herrar', players: 2, cards: 3 }) as { template: { faces: Record<string, { base: Record<string, unknown>[] }> } }
  doc.template.faces['front']!.base.push(...extra)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('[data-drag="title"]')).toBeVisible()
  // Non-vacuity: this is the pointer the case is about.
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(coarse)
}

async function choose(page: Page, id: string) {
  await page.locator(`[data-drag="${id}"]`).tap()
  await expect.poll(() => selected(page)).toBe(id)
}

for (const off of [8, 14]) {
  test(`a finger ${off} px off the corner takes the handle, and not the shape under it`, async ({ page }) => {
    await openWith(page)
    await choose(page, 'body')
    const frameBefore = await mm(page, 'frame')
    const before = await mm(page, 'body')
    const handle = (await page.locator('[data-drag="body"] .byd-drag-handle[data-handle="se"]').boundingBox())!
    // Off on both axes, as the audit pressed: outside the 15 px the handle is drawn at.
    const at = { x: handle.x + handle.width / 2 + off, y: handle.y + handle.height / 2 + off }
    expect(handle.width / 2).toBeLessThan(off)
    await press(page, at, { x: -40, y: -30 })
    await expect.poll(async () => (await mm(page, 'body')).w).toBeLessThan(before.w - 2)
    expect((await mm(page, 'body')).x).toBe(before.x)
    expect(await selected(page)).toBe('body')
    expect(await mm(page, 'frame')).toEqual(frameBefore)
  })
}

// An element too small for four fingertip targets gives each press to the corner it is nearest.
test('on a small element a press near a corner takes that corner, not the one across', async ({ page }) => {
  await openWith(page, [{ kind: 'shape', id: 'tiny', x: 25, y: 76, w: 6, h: 5, shape: 'rect', fill: '#a33' }])
  await choose(page, 'tiny')
  const before = await mm(page, 'tiny')
  const box = (await page.locator('[data-drag="tiny"]').boundingBox())!
  // A quarter in from the bottom right corner, which is nearer se than nw.
  await press(page, { x: box.x + box.width * 0.75, y: box.y + box.height * 0.75 }, { x: 30, y: 20 })
  await expect.poll(async () => (await mm(page, 'tiny')).w).toBeGreaterThan(before.w + 2)
  const after = await mm(page, 'tiny')
  // se grows to the right and down: the top-left corner stayed where it was.
  expect([after.x, after.y]).toEqual([before.x, before.y])
})

// A mouse keeps the small target: the hit area is the handle as it is drawn, so a small element can
// still be taken between its handles.
test.describe('with a mouse', () => {
  test.use({ hasTouch: false })
  test('a press beside a corner still lands on what is there', async ({ page }) => {
    await openWith(page, [], false)
    await page.locator('[data-drag="body"]').click()
    await expect.poll(() => selected(page)).toBe('body')
    const b = (await page.locator('[data-drag="body"] .byd-drag-handle[data-handle="se"]').boundingBox())!
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest('.byd-drag-handle') !== null, [b.x + b.width / 2 + 14, b.y + b.height / 2 + 14])
    expect(hit).toBe(false)
  })
})

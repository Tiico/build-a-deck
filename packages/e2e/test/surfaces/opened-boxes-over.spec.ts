import { expect, test, type Locator, type Page } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProject, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// An opened box lies over everything else (L55, #622). The column door was the first box lifted
// into the page's top layer (#611); every other box `placement.ts` places stood where its parent
// put it, and a parent that scrolls cuts what hangs out of it. The placement reads the room the
// window has, so it opens a box downward into room the window has and the parent does not.
test.use({ viewport: { width: 1280, height: 640 }, locale: 'sv-SE' })

// Whether a control is what a pointer at its centre would press: not under something else and not
// cut away by a box it stands inside of. The browser's answer, not arithmetic about rectangles.
async function onTop(control: Locator) {
  return control.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit !== null && el.contains(hit)
  })
}

// That a box is lifted over the page, and stands exactly where its own sheet would have put it in
// place: the box is let down again — out of the top layer, the coordinates the lift gave it taken
// back — and the two rectangles compared. An unclipped box in place is the design every one of
// them was approved in, so a lift that moved one is a lift that redesigned it.
async function liftedWhereItStood(box: Locator) {
  await expect(box).toBeVisible()
  const over = await onTop(box)
  const read = await box.evaluate((el: HTMLElement) => {
    const lifted = el.getBoundingClientRect()
    const open = el.matches(':popover-open')
    el.removeAttribute('popover')
    for (const prop of ['position', 'top', 'right', 'bottom', 'left', 'margin']) el.style.removeProperty(prop)
    const placed = el.getBoundingClientRect()
    return { open, dx: Math.round(lifted.left - placed.left), dy: Math.round(lifted.top - placed.top) }
  })
  expect({ over, ...read }).toEqual({ over: true, open: true, dx: 0, dy: 0 })
}

async function openTable(page: Page) {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 77 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await expect(page.locator('.byd-data tbody tr').first()).toBeVisible()
}

test('the symbol box a cell opens is whole over the foot of the table', async ({ page }) => {
  await openTable(page)
  const scroll = page.locator('.byd-data-scroll')
  // A row in the lower half of the table's box, with the foot of that box a short way under it:
  // where a box hanging from the cell has more room in the window than in the table.
  const index = await scroll.evaluate((box) => {
    const foot = box.getBoundingClientRect().bottom
    const rows = [...box.querySelectorAll('tbody tr')]
    return rows.findIndex((row) => {
      const r = row.getBoundingClientRect()
      return r.bottom < foot && foot - r.bottom < 200 && window.innerHeight - r.bottom > 260
    })
  })
  expect(index).toBeGreaterThanOrEqual(0)
  const cell = page.locator('.byd-data tbody tr').nth(index).locator('td[data-col="title"] input')
  await cell.click()
  const before = await scroll.evaluate((el) => el.scrollTop)
  await cell.pressSequentially('{')

  const box = page.getByRole('group', { name: 'Infoga symbol' })
  await expect(box).toBeVisible()
  const options = box.getByRole('option')
  await expect(options.first()).toBeVisible()
  // The box is whole on the screen and nothing is drawn over it or cuts it.
  await expect(box).toBeInViewport({ ratio: 1 })
  expect(await onTop(options.first())).toBe(true)
  expect(await onTop(box.locator(':scope > :last-child'))).toBe(true)
  // And opening it moved nothing under it: the cell being written in is where it was.
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before)
  await expect(cell).toBeFocused()
  await expect(cell).toBeInViewport()
  await liftedWhereItStood(box)
})

test('the column door is lifted where it hung', async ({ page }) => {
  await openTable(page)
  await page.getByRole('button', { name: 'Kolumner' }).click()
  await liftedWhereItStood(page.getByRole('group', { name: 'Kolumner' }))
})

// The row the keys are on is brought into the list it stands in, and into nothing else (#235,
// #622). Eight symbols do not fit the list's own height, so the keys walk past its edge and the
// list scrolls to show the marked row. It is `scrollIntoView` that does it, which scrolls every
// box around the row — and with the list lifted over the page, the table is no longer one of them.
test('the arrows walk the whole list, and bring the row they are on into it without moving the table', async ({ page }) => {
  await openTable(page)
  const scroll = page.locator('.byd-data-scroll')
  const cell = page.locator('.byd-data tbody tr').nth(1).locator('td[data-col="title"] input')
  await cell.click()
  await cell.pressSequentially('{')
  const options = page.getByRole('group', { name: 'Infoga symbol' }).getByRole('option')
  await expect(options).toHaveCount(8)
  const before = await scroll.evaluate((el) => el.scrollTop)

  for (let i = 0; i < 7; i++) await cell.press('ArrowDown')
  const last = options.last()
  await expect(last).toHaveAttribute('aria-selected', 'true')
  await expect(last).toBeInViewport({ ratio: 1 })
  expect(await onTop(last)).toBe(true)
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(before)
  await expect(cell).toBeFocused()
})

test('a slot in a zone’s actions opens its choices over the panel it stands in', async ({ page }) => {
  const doc = gameDoc({ name: 'Skogens herrar', players: 4 }) as unknown as ProjectDoc
  doc.setup = {
    ...doc.setup,
    zones: doc.setup.zones.map((zone) => (zone.id === 'draw' ? { ...zone, actions: [{ id: 'a1', label: 'Dela ut', steps: [{ v: 'shuffle' }, { v: 'deal', each: { of: 'number', n: 7 }, to: { at: 'hands' }, face: 'keep' }] }] } : zone)),
  }
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-tables').click()
  await page.locator('[data-zone-row="draw"] button').first().click()
  const panel = page.locator('[data-zone-actions]')
  await expect(panel).toBeVisible()
  const slot = panel.locator('.byd-slot').last()
  await slot.click()
  await liftedWhereItStood(panel.locator('.byd-slot-pop'))
})

test('a table’s menu of ways in opens over the list it hangs in', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4, cards: 9 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-tables').click()
  await page.locator('.byd-tables-new').click()
  const row = page.locator('.byd-table-row').first()
  await row.locator('.byd-tables-more').click()
  await liftedWhereItStood(row.locator('.byd-tables-menu'))
})

test('the zoom pill’s choices open over the canvas, upward from its corner', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 2 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  // The pill stands at the foot of the canvas (L19, #619), so the only room its choices have is
  // above it; a box the room put downward would hang off the window.
  await page.getByRole('button', { name: /^Förstoring: / }).click()
  await liftedWhereItStood(page.locator('.byd-pill-menu'))
  await expect(page.locator('.byd-pill-menu')).toHaveAttribute('data-place-y', 'up')
})

test('the rulebook’s [[ list opens over the book it is written in', async ({ page }) => {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'text', id: 't1', text: 'Dra ett kort.' }] }
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-rules').click()
  await page.locator('[data-rulebook] [data-block="t1"]').locator('[role="button"], .byd-block-door').first().click()
  const field = page.locator('[data-rulebook] [data-block="t1"] textarea')
  await expect(field).toBeFocused()
  await field.press('ControlOrMeta+ArrowDown')
  await field.pressSequentially(' [[')
  await liftedWhereItStood(page.locator('.byd-rules-refs'))
  await expect(field).toBeFocused()
})

test('the icon tool opens the library beside it, over the canvas', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 4 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await page.locator('.byd-canvas-tool-icon > button').click()
  await liftedWhereItStood(page.locator('.byd-canvas-symbols'))
})

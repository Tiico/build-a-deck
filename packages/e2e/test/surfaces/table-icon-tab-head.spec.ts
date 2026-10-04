import { expect, test, type Locator, type Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// The icon tab against the table's head (#693, beställarens beslut A).
//
// The tab «{ }» stands on the field's top right corner, over the row above (#593). In the first row
// what is above is the head, and in a column as narrow as `typ` the tab lay on the column's filter
// handle ▾; with the library open it went under the head altogether. So against the head the tab
// hangs under the field's corner instead, and the library starts 4 px under it. Which row stands
// against the head is measured and not counted: in a rolled table it is some other row than the
// first. The web suite measures the geometry against the stylesheet; this asks the running app,
// where it is the table's own reading of itself — on entering a cell and on a scroll — that has to
// say which row that is.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

const TYPES = ['Playcard', 'Location', 'Effect', 'Shopcard']

async function openTable(page: Page) {
  await logIn(page.request)
  // A word-wide column beside the title, which is where the tab reaches the ▾.
  const doc = gameDoc({ name: "Sal's Saloon", cards: 60 })
  const project = await makeProjectOf(page.request, { ...doc, rows: doc.rows.map((r, i) => ({ ...r, fields: { ...r.fields, typ: TYPES[i % TYPES.length] } })) })
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-table').click()
  const box = page.locator('.byd-data-scroll')
  await expect(box.locator('tbody tr')).toHaveCount(60)
  return box
}

// What a pointer at an element's centre would press.
const pressed = (el: Locator) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit !== null && node.contains(hit)
  })

// Which side of its field the tab is on, and whether both it and the ▾ can be pressed.
async function read(page: Page, cell: Locator) {
  const tab = cell.locator('xpath=ancestor::td').locator('.byd-data-icon')
  await expect(tab).toBeVisible()
  const field = (await cell.boundingBox())!
  const at = (await tab.boundingBox())!
  return {
    side: Math.round(at.y) === Math.round(field.y + field.height) ? 'under' : Math.round(at.y + at.height) === Math.round(field.y) ? 'over' : `${at.y} against ${field.y}–${field.y + field.height}`,
    right: Math.round(field.x + field.width - (at.x + at.width)),
    tab: await pressed(tab),
    handle: await pressed(page.locator('.byd-data thead th[data-col="typ"] .byd-column-filter')),
  }
}

test('the tab hangs under the field in the first row, and the ▾ and the tab can both be pressed', async ({ page }) => {
  const box = await openTable(page)
  const first = box.getByRole('textbox', { name: 'kort-1 typ' })
  await first.click()
  expect(await read(page, first)).toEqual({ side: 'under', right: 0, tab: true, handle: true })

  // The tab is pressed, the library opens 4 px under it, and the tab is still there to press.
  await first.locator('xpath=ancestor::td').locator('.byd-data-icon').click()
  const library = page.getByRole('group', { name: 'Infoga symbol' })
  await expect(library).toBeVisible()
  const tab = (await first.locator('xpath=ancestor::td').locator('.byd-data-icon').boundingBox())!
  expect(Math.round((await library.boundingBox())!.y - (tab.y + tab.height))).toBe(4)
  expect(await read(page, first)).toEqual({ side: 'under', right: 0, tab: true, handle: true })
  await page.keyboard.press('Escape')

  // One row down there is a row above, and the tab stands over it again. Down the column by the
  // key (#479), which is how the next row is reached — the tab under the first row lies on the end
  // of the second's value, which is the price A was chosen with.
  await expect(first).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const second = box.getByRole('textbox', { name: 'kort-2 typ' })
  await expect(second).toBeFocused()
  expect(await read(page, second)).toEqual({ side: 'over', right: 0, tab: true, handle: true })
})

test('in a rolled table the row against the head is the one the tab hangs under', async ({ page }) => {
  const box = await openTable(page)
  const row = box.locator('tbody tr[data-card-ref="kort-20"]')
  await box.evaluate((el, ref) => {
    const r = el.querySelector(`tbody tr[data-card-ref="${ref}"]`)!
    el.scrollTop += r.getBoundingClientRect().top - el.querySelector('thead th')!.getBoundingClientRect().bottom
  }, 'kort-20')
  expect(await box.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  const cell = row.getByRole('textbox', { name: 'kort-20 typ' })
  await cell.click()
  await expect.poll(() => read(page, cell)).toEqual({ side: 'under', right: 0, tab: true, handle: true })

  // Rolled back by a row, kort-19 stands against the head and kort-20 has a row above it again.
  await box.evaluate((el) => {
    el.scrollTop -= (el.querySelector('tbody tr') as HTMLElement).offsetHeight
  })
  await expect.poll(() => read(page, cell)).toEqual({ side: 'over', right: 0, tab: true, handle: true })
})

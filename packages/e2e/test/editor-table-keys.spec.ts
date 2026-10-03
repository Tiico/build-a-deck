import type { Page } from '@playwright/test'
import { logIn, makeProject } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// End, Home and PageDown in a cell of the card table (#692, L49).
//
// The playtest put the caret on place three in «Titel» and pressed End: the table's box scrolled
// from 0 to 3092, the caret stayed on three, and the cell being written in stood 2853 px above
// the window. That is what End means in a Mac text field — scroll the document to its end — and it
// is the wrong answer in a table, where the box is the document and the field is the line being
// written. Home did the same the other way, the body cell the same, and PageDown scrolled a box's
// height away from a focus it left behind.
//
// What a cell owes the keys is the same on every machine: End and Home move the caret within the
// value and never the box, and the row with the focus stands in the box (L49). On Linux the first
// half is Chromium's own answer already; on a Mac — where the playtest was — it is not, and that
// is the run in which this suite is a test of anything for End and Home. PageDown is wrong on both.
test.use({ viewport: DESK.viewport })

async function openTable(page: Page) {
  await logIn(page.request)
  // Enough cards that the box scrolls a long way: a table that fits has nowhere to be thrown to.
  const project = await makeProject(page.request, { name: 'Salongen', cards: 80 })
  await page.goto(project.editorUrl)
  const tab = page.locator('#byd-editor-tab-table')
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  const box = page.locator('.byd-data-scroll')
  await expect(box.locator('tbody tr')).toHaveCount(80)
  // Non-vacuity: the box really can scroll far, so a key that throws it would be seen.
  expect(await box.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(1000)
  return box
}

// Where the focus is, and whether its row stands inside the box below the sticky head.
const where = (page: Page) =>
  page.evaluate(() => {
    const box = document.querySelector('.byd-data-scroll')!
    const el = document.activeElement as HTMLElement
    const row = el.closest('tr')!.getBoundingClientRect()
    const frame = box.getBoundingClientRect()
    const head = box.querySelector('thead')!.getBoundingClientRect().bottom
    return {
      label: el.getAttribute('aria-label'),
      scrollTop: box.scrollTop,
      pageY: window.scrollY,
      inView: row.top >= head - 1 && row.bottom <= frame.bottom + 1,
    }
  })

test.describe('the keys that would throw the card table', () => {
  test('End and Home in a cell move the caret and never the box', async ({ page }) => {
    const box = await openTable(page)
    const cell = box.getByRole('textbox', { name: 'kort-1 title' })
    await cell.click()
    const value = await cell.inputValue()
    expect(value.length, 'a value long enough to have a middle').toBeGreaterThan(4)
    await cell.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3))

    await page.keyboard.press('End')
    expect(await cell.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([value.length, value.length])
    expect(await where(page)).toMatchObject({ label: 'kort-1 title', scrollTop: 0, pageY: 0, inView: true })

    await page.keyboard.press('Home')
    expect(await cell.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 0])
    expect(await where(page)).toMatchObject({ label: 'kort-1 title', scrollTop: 0, pageY: 0, inView: true })

    // With Shift the caret's far end goes, and the near one stays where it was.
    await cell.evaluate((el: HTMLInputElement) => el.setSelectionRange(3, 3))
    await page.keyboard.press('Shift+End')
    expect(await cell.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([3, value.length])
    await page.keyboard.press('Shift+Home')
    expect(await cell.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([0, 3])
    expect((await where(page)).scrollTop).toBe(0)
  })

  test('End and Home in the body cell move the caret within its line and never the box', async ({ page }) => {
    const box = await openTable(page)
    const body = box.getByRole('textbox', { name: 'kort-1 body' })
    await body.click()
    // The caret at the line's start, asked of the cell's own text so no offset is written here.
    await body.evaluate((el) => {
      const text = el.querySelector('p')?.firstChild ?? el.firstChild!
      getSelection()!.collapse(text, 0)
    })
    const caret = () => body.evaluate(() => ({ offset: getSelection()!.focusOffset, length: getSelection()!.focusNode?.textContent?.length ?? -1 }))
    expect((await caret()).offset).toBe(0)

    await page.keyboard.press('End')
    const atEnd = await caret()
    expect(atEnd.offset, 'the caret went to the end of the line').toBe(atEnd.length)
    expect(atEnd.length).toBeGreaterThan(0)
    expect(await where(page)).toMatchObject({ label: 'kort-1 body', scrollTop: 0, pageY: 0, inView: true })

    await page.keyboard.press('Home')
    expect((await caret()).offset).toBe(0)
    expect(await where(page)).toMatchObject({ label: 'kort-1 body', scrollTop: 0, pageY: 0, inView: true })
  })

  test('PageDown and PageUp take the focus with the page, and the row stays in the box', async ({ page }) => {
    const box = await openTable(page)
    await box.getByRole('textbox', { name: 'kort-1 title' }).click()

    await page.keyboard.press('PageDown')
    const down = await where(page)
    // The focus went with the page: down the same column, more than one row, and still in view.
    expect(down.label).toMatch(/^kort-(\d+) title$/)
    const row = Number(/kort-(\d+)/.exec(down.label!)![1])
    expect(row).toBeGreaterThan(2)
    expect(down.inView).toBe(true)
    expect(down.pageY).toBe(0)

    await page.keyboard.press('PageDown')
    const further = await where(page)
    expect(Number(/kort-(\d+)/.exec(further.label!)![1])).toBeGreaterThan(row)
    expect(further.inView).toBe(true)

    await page.keyboard.press('PageUp')
    await page.keyboard.press('PageUp')
    expect(await where(page)).toMatchObject({ label: 'kort-1 title', inView: true, pageY: 0 })

    // From the body cell as well, which is a cell of the same column walk.
    await box.getByRole('textbox', { name: 'kort-1 body' }).click()
    await page.keyboard.press('PageDown')
    const body = await where(page)
    expect(body.label).toMatch(/^kort-\d+ body$/)
    expect(body.label).not.toBe('kort-1 body')
    expect(body.inView).toBe(true)

    // At the end of the table PageDown stops at the last card, in view.
    await box.getByRole('textbox', { name: 'kort-79 title' }).click()
    await page.keyboard.press('PageDown')
    expect(await where(page)).toMatchObject({ label: 'kort-80 title', inView: true })
  })
})

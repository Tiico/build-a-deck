import { expect, test, type Locator } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// An opened box lies over everything else (#611, L55). The column door hung from the head's last
// cell *inside* the box the table scrolls in, and that box clips: in a window 640 px tall the
// door's own foot — «Lägg till» and «Avbryt» — was cut off at the scroll box's edge, and «+ Nytt
// kort» stood where they should have been. The placement had measured the room against the window,
// so it believed the door fitted.
test.use({ viewport: { width: 1280, height: 640 }, locale: 'sv-SE' })

// Whether a control is the thing a pointer at its centre would press: not hidden under something
// else, and not cut away by a box it stands inside of. Asked of the page, so it is the browser's
// own answer and not arithmetic about rectangles.
async function onTop(control: Locator) {
  return control.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return hit !== null && el.contains(hit)
  })
}

// A deck with the columns a real one has: the door lists every one of them above its form, so this
// is what makes it tall — the fixture's four fit under the scroll box's foot by a hair.
function deck() {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 77 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: 'Playcard', raritet: 'Guld', grupp: String(i % 4), smak: '' } }))
  return doc
}

test('the column door opens over the table and the button under it, whole', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, deck())
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  const scroll = page.locator('.byd-data-scroll')
  await expect(scroll.locator('tbody tr').first()).toBeVisible()
  await page.getByRole('button', { name: 'Kolumner' }).click()

  const door = page.getByRole('group', { name: 'Kolumner' })
  const add = door.getByRole('button', { name: 'Lägg till' })
  const cancel = door.getByRole('button', { name: 'Avbryt' })
  await expect(add).toBeInViewport({ ratio: 1 })
  await expect(cancel).toBeInViewport({ ratio: 1 })

  // Not a reading of a door that happens to fit: it reaches past the foot of the box the table
  // scrolls in, which is exactly where it used to be cut.
  const [doorBox, scrollBox] = await Promise.all([door.boundingBox(), scroll.boundingBox()])
  expect(doorBox!.y + doorBox!.height).toBeGreaterThan(scrollBox!.y + scrollBox!.height)

  expect(await onTop(add)).toBe(true)
  expect(await onTop(cancel)).toBe(true)
  expect(await onTop(door.getByRole('textbox', { name: 'Namn' }))).toBe(true)

  // And opening it moves nothing under it. The door opens with the caret in its name box, and a
  // box focused while it still stood inside the table was a box the table scrolled down to show:
  // several hundred pixels, which put the rows somewhere else behind a door that was only opened.
  await expect(door.getByRole('textbox', { name: 'Namn' })).toBeFocused()
  expect(await scroll.evaluate((el) => el.scrollTop)).toBe(0)
})

for (const width of [1280, 1024]) {
  test(`column controls stay compact and help closes back to the chooser at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 640 })
    await logIn(page.request)
    const doc = deck()
    doc.prose = { body: false }
    const project = await makeProjectOf(page.request, doc)
    await page.goto(project.editorUrl)
    await page.locator('#byd-editor-tab-table').click()
    await page.getByRole('button', { name: 'Kolumner', exact: true }).click()
    const door = page.getByRole('group', { name: 'Kolumner', exact: true })
    const rows = door.locator('li[data-col]')
    // Every column remains a single control row, including an explicit prose choice with its
    // reset action. Repeated explanations used to make each of these rows over 72 px tall.
    const heights = await rows.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))
    expect(heights.length).toBeGreaterThan(6)
    expect(heights.every((height) => height === 44)).toBe(true)
    expect(await door.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(door.getByRole('button', { name: 'Följ höjden igen, body' })).toBeVisible()
    await expect(door.getByText(/Höjden föreslår/)).toHaveCount(0)
    const ask = door.getByRole('button', { name: 'Hjälp om kolumnerna' })
    await ask.click()
    const help = page.getByRole('dialog', { name: 'Hjälp om kolumnerna' })
    await expect(help).toContainText('Prosa ger flera rader och textformatering.')
    expect(await onTop(help.getByRole('button', { name: 'Stäng hjälpen' }))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(help).toHaveCount(0)
    await expect(ask).toBeFocused()
    await expect(door).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(door).toHaveCount(0)
    await page.getByRole('button', { name: 'Kolumner', exact: true }).click()
    // Reset remains an action in the row, not a control buried in the help.
    await door.getByRole('button', { name: 'Följ höjden igen, body' }).click()
    await expect(door.getByRole('button', { name: 'Följ höjden igen, body' })).toHaveCount(0)
    await expect(door.getByRole('button', { name: 'Prosa, body' })).toHaveAttribute('aria-pressed', 'true')
    // Validation must still have room after ordinary rows become single-line controls.
    await door.getByRole('button', { name: 'Byt namn på kolumnen body' }).click()
    const name = door.getByRole('textbox', { name: 'Namn på kolumnen body' })
    await name.fill('')
    const refused = door.locator('[role="status"]')
    await expect(refused).toBeVisible()
    const [inputBox, refusalBox] = await Promise.all([name.boundingBox(), refused.boundingBox()])
    expect(refusalBox!.y).toBeGreaterThanOrEqual(inputBox!.y + inputBox!.height)
    expect(await door.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
  })
}

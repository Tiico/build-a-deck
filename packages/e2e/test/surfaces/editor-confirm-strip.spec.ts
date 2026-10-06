import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { logIn, makeProjectOf } from '../../support/api.js'

// The editor's strips and the work under them (#698). A question about a layer, and the note a
// locked layer gives, are asked while the designer is looking at the card — so the card stands
// still while they are asked: the fit follows the window (L19), and a strip is not the window.
test.use({ locale: 'sv-SE' })

async function openTemplate(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await logIn(page.request)
  const project = await makeProjectOf(page.request, spelkortDoc(4))
  await page.goto(`${project.editorUrl}&lang=sv`)
  await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
  await page.locator('#byd-editor-tab-template').click()
  await expect(page.locator('[data-drag="body"]')).toBeVisible()
}

// Where the card is drawn and how big, to the pixel; and the zoom it is drawn at.
const cardAt = (page: Page) =>
  page.evaluate(() => {
    const r = document.querySelector('.byd-canvas-stage [data-card]')!.getBoundingClientRect()
    const scale = getComputedStyle(document.querySelector('.byd-canvas-stage')!).getPropertyValue('--byd-canvas-scale')
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), scale }
  })

// A press that lands on something no strip has a part in: the tools' Text button, focused and not
// pressed, so the Backspace that follows is heard by the editor and not by a field.
const awayFromTheList = (page: Page) => page.getByRole('toolbar', { name: /verktyg/i }).getByRole('button', { name: 'Text' }).focus()

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`the card stands still while a layer's question is asked, at ${width} × ${height}`, async ({ page }) => {
    await openTemplate(page, width, height)
    await page.locator('[data-layer="body"] .byd-layer-pick').click()
    const before = await cardAt(page)
    await awayFromTheList(page)
    await page.keyboard.press('Backspace')
    const asked = page.getByRole('alertdialog')
    await expect(asked).toBeVisible()
    // Every answer whole on the screen.
    for (const answer of await asked.getByRole('button').all()) await expect(answer).toBeInViewport({ ratio: 1 })
    expect(await cardAt(page)).toEqual(before)
    await page.keyboard.press('Escape')
    await expect(asked).toBeHidden()
    expect(await cardAt(page)).toEqual(before)
  })

  test(`the card stands still while a locked layer says why, at ${width} × ${height}`, async ({ page }) => {
    await openTemplate(page, width, height)
    await page.locator('[data-layer="body"] .byd-layer-lock').click()
    const before = await cardAt(page)
    const box = (await page.locator('[data-drag="body"]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 10)
    await page.mouse.up()
    await expect(page.locator('.byd-canvas-locked')).toContainText('är låst')
    expect(await cardAt(page)).toEqual(before)
  })
}

// A change and a step back, so the confirmation stands at the bottom of the screen.
async function confirmationStanding(page: Page) {
  await page.locator('[data-layer="body"] .byd-layer-pick').click()
  const x = page.locator('.byd-props-f input').first()
  await x.fill('3')
  await x.press('Enter')
  await page.getByRole('button', { name: /^Ångra/ }).first().click()
  const said = page.locator('.byd-editor-confirm')
  await expect(said).toHaveText('Tog tillbaka: en ändring i mallen')
  return said
}

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`a press on what just happened presses nothing under it, at ${width} × ${height}`, async ({ page }) => {
    await openTemplate(page, width, height)
    const said = await confirmationStanding(page)
    // Not vacuous: the line lies over a control here — the card row's step or its name.
    const under = await said.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const at = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2).filter((e) => !el.contains(e))
      return at[0]?.closest('button, a, input, select')?.textContent?.trim() ?? null
    })
    expect(under).not.toBeNull()
    await page.evaluate(() => {
      const w = window as unknown as { pressed: string[] }
      w.pressed = []
      document.addEventListener('click', (e) => {
        const hit = (e.target as Element).closest('button, a, input, select')
        if (hit) w.pressed.push(hit.textContent?.trim() ?? '')
      }, true)
    })
    const box = (await said.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
    expect(await page.evaluate(() => (window as unknown as { pressed: string[] }).pressed)).toEqual([])
    await expect(page.getByRole('listbox')).toHaveCount(0)
    // The line steps aside for the press, so the control under it is one press away and not none.
    await expect(said).toBeHidden({ timeout: 1000 })
  })
}

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`what just happened gives way to a question, at ${width} × ${height}`, async ({ page }) => {
    await openTemplate(page, width, height)
    const said = await confirmationStanding(page)
    await page.locator('[data-layer="body"] .byd-layer-pick').click()
    await awayFromTheList(page)
    await page.keyboard.press('Backspace')
    const asked = page.getByRole('alertdialog')
    await expect(asked).toBeVisible()
    // The question is the present: the line about the past is not drawn over its answers — and
    // a step taken while it stands is not drawn there either.
    // Within a second: the confirmation takes itself back after six anyway, and a wait that long
    // for it to go would pass on that alone.
    await expect(said).toBeHidden({ timeout: 1000 })
    await page.keyboard.press('ControlOrMeta+Shift+z')
    // The step was taken and said: the change is made again.
    await expect(page.locator('.byd-props-f input').first()).toHaveValue('3')
    await expect(asked).toBeVisible()
    const answers = await Promise.all((await asked.getByRole('button').all()).map(async (b) => (await b.boundingBox())!))
    const over = (await said.isVisible()) ? await said.boundingBox() : null
    expect(answers.filter((box) => over !== null && overlaps(box, over))).toEqual([])
  })
}

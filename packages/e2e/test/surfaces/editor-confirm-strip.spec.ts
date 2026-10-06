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

type Box = { x: number; y: number; width: number; height: number }
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

// Every control drawn on the screen, as rectangles: what a line about the past must never lie on.
const controls = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('button, a[href], input, select, textarea, label, summary, [role="tab"], [role="button"], [tabindex="0"]:not([role="tabpanel"], section)')]
      .filter((el) => !el.closest('.byd-editor-confirm'))
      .map((el) => {
        // What shows of it: a cell scrolled half under the table's edge is cut by the box that
        // scrolls, and the part that is cut is not on the screen to be covered.
        const r = el.getBoundingClientRect()
        let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom]
        for (let up = el.parentElement; up; up = up.parentElement) {
          const style = getComputedStyle(up)
          if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
          const box = up.getBoundingClientRect()
          ;[left, top, right, bottom] = [Math.max(left, box.left), Math.max(top, box.top), Math.min(right, box.right), Math.min(bottom, box.bottom)]
        }
        // What is drawn on the card moves with the step itself, and the card is held still above.
        const onCard = el.closest('.byd-canvas-stage') !== null
        // The header answers the step itself (saved, unsaved, the step buttons' names); the tab's
        // work is what must not move for the line.
        const inWork = el.closest('[role="tabpanel"]') !== null
        return { name: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40), onCard, inWork, x: left, y: top, width: right - left, height: bottom - top }
      })
      .filter((b) => b.width > 0 && b.height > 0),
  )

const TABS = ['wall', 'template', 'table', 'theme', 'media', 'rules', 'tables'] as const

// Where what just happened is said (#698, beslut B 2026-10-06): in the foot's status place on every
// tab, in the stead of the foot's quiet line. It lies over nothing and takes no height from the work.
for (const [width, height] of [[1280, 800], [1024, 768]] as const) {
  test(`what just happened stands in every tab's foot and over no control, at ${width} × ${height}`, async ({ page }) => {
    test.setTimeout(180_000)
    await openTemplate(page, width, height)
    for (const tab of TABS) {
      // A change in the template, and the step back taken on the tab under test: the same news
      // wherever the designer happens to be standing when she takes it back.
      await page.locator('#byd-editor-tab-template').click()
      await page.locator('[data-layer="body"] .byd-layer-pick').click()
      const x = page.locator('.byd-props-f input').first()
      await x.fill(String(TABS.indexOf(tab) + 10))
      await x.press('Enter')
      await page.locator(`#byd-editor-tab-${tab}`).click()
      const panel = page.locator(`#byd-editor-panel-${tab}`)
      await expect(panel).toBeVisible()
      await page.getByRole('button', { name: /^Ångra/ }).first().click()
      const said = panel.locator('.byd-editor-confirm')
      await expect(said, tab).toHaveText('Tog tillbaka: en ändring i mallen')
      await expect(said, tab).toBeInViewport({ ratio: 1 })
      const box = (await said.boundingBox())!
      const now = await controls(page)
      expect(now.filter((c) => overlaps(c, box)).map((c) => c.name), tab).toEqual([])
      // It is still said to a reader who does not see it.
      await expect(page.locator('[data-status-live="polite"]')).toHaveText('Tog tillbaka: en ändring i mallen')
      // Only one of it on the screen.
      await expect(page.locator('.byd-editor-confirm:visible')).toHaveCount(1)
      // It costs no height: nothing on the tab moves when it takes itself back after its six seconds.
      await expect(said).toBeHidden({ timeout: 8000 })
      const after = await controls(page)
      const placed = (all: typeof now) => all.filter((c) => c.inWork && !c.onCard).map(({ x, y, width, height }) => [Math.round(x), Math.round(y), Math.round(width), Math.round(height)])
      expect(placed(now), tab).toEqual(placed(after))
    }
  })
}

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

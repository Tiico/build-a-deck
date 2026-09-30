import { logIn, makeProjectOf } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

// A jump in the wall's table of contents is one answer, not a walk through every band on the way.
//
// The wall scrolls to a band smoothly, and the mark that says which band the view stands in is read
// off the scroll. Read per frame during a jump, the mark left the band that was pressed at once,
// went back to where the view had been, and then climbed through every band between the two before
// landing again — the column flickered for as long as the animation ran, and every step of it
// redrew the whole wall. That only happens in a browser that really animates a scroll, so it is
// measured here and not in jsdom.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const TYPES = ['Björn', 'Varg', 'Räv', 'Lo', 'Järv', 'Älg', 'Hjort', 'Uggla'] as const

test('a jump marks the band that was pressed and nothing on the way to it', async ({ page }) => {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Skogens grupper', cards: 96 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: TYPES[Math.floor(i / 12)]! } }))
  doc.template.faces['front']!.variantBy = 'typ'
  const project = await makeProjectOf(page.request, doc)

  await page.goto(project.editorUrl)
  const jumps = page.locator('.byd-wall-jump [data-jump]')
  await expect(jumps).toHaveCount(TYPES.length)
  await expect(page.locator('.byd-wall-jump [aria-current="true"]')).toHaveAttribute('data-jump', 'Björn')

  // Every band the column marks, in order, from the press until the wall stands still.
  await page.evaluate(() => {
    const seen: string[] = []
    ;(window as unknown as { marks: string[] }).marks = seen
    const column = document.querySelector('.byd-wall-jump')!
    new MutationObserver(() => {
      const now = column.querySelector('[aria-current="true"]')?.getAttribute('data-jump') ?? ''
      if (seen.at(-1) !== now) seen.push(now)
    }).observe(column, { subtree: true, attributes: true, attributeFilter: ['aria-current'] })
  })
  const target = 'Hjort'
  await page.locator(`.byd-wall-jump [data-jump="${target}"]`).click()

  const deck = page.locator('.byd-wall-deck')
  // Still, and standing where the jump sent it.
  await expect
    .poll(async () => {
      const a = await deck.evaluate((el) => el.scrollTop)
      await page.waitForTimeout(150)
      const b = await deck.evaluate((el) => el.scrollTop)
      return a === b && b > 0
    })
    .toBe(true)
  const marks = await page.evaluate(() => (window as unknown as { marks: string[] }).marks)
  expect(marks, 'the bands the column marked during the jump').toEqual([target])
  await expect(page.locator('.byd-wall-jump [aria-current="true"]')).toHaveAttribute('data-jump', target)

  // And a reader who scrolls afterwards is followed again: the jump does not freeze the mark.
  await deck.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(page.locator('.byd-wall-jump [aria-current="true"]')).toHaveAttribute('data-jump', 'Björn')

  // The last band's top lies beyond all the room the wall has, so that jump comes to rest short
  // of it — and must still let go of the mark once it has.
  await page.evaluate(() => (window as unknown as { marks: string[] }).marks.splice(0))
  await page.locator('.byd-wall-jump [data-jump="Uggla"]').click()
  await expect
    .poll(async () => {
      const a = await deck.evaluate((el) => el.scrollTop)
      await page.waitForTimeout(150)
      return a === (await deck.evaluate((el) => el.scrollTop)) && a > 0
    })
    .toBe(true)
  expect(await page.evaluate(() => (window as unknown as { marks: string[] }).marks)).toEqual(['Uggla'])
  await deck.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(page.locator('.byd-wall-jump [aria-current="true"]')).toHaveAttribute('data-jump', 'Björn')
})

test('a hand on the wall mid-jump takes the mark back', async ({ page }) => {
  await logIn(page.request)
  const doc = gameDoc({ name: 'Skogens grupper', cards: 96 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: TYPES[Math.floor(i / 12)]! } }))
  doc.template.faces['front']!.variantBy = 'typ'
  const project = await makeProjectOf(page.request, doc)

  await page.goto(project.editorUrl)
  const deck = page.locator('.byd-wall-deck')
  await expect(page.locator('.byd-wall-jump [data-jump]')).toHaveCount(TYPES.length)
  // The reader turns back while the jump is still on its way, and wheels to the very top. A
  // wheel sent from here arrives after the animation is over, so the hand is put on the wall in
  // the page, a few frames into the jump: the wheel the reader turns and the scroll it makes.
  const stood = await deck.evaluate(async (el) => {
    ;(document.querySelector('.byd-wall-jump [data-jump="Uggla"]') as HTMLElement).click()
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame)
    const mid = el.scrollTop
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -5000, bubbles: true }))
    el.scrollTo({ top: 0, behavior: 'instant' })
    return mid
  })
  expect(stood, 'the jump was on its way, not arrived').toBeLessThan(await deck.evaluate((el) => el.scrollHeight - el.clientHeight))
  await expect.poll(() => deck.evaluate((el) => el.scrollTop)).toBe(0)
  await expect(page.locator('.byd-wall-jump [aria-current="true"]')).toHaveAttribute('data-jump', 'Björn')
})

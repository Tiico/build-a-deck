import type { Page } from '@playwright/test'
import { logIn } from '../../support/api.js'
import { expect, test } from '../../support/test.js'

// Three things about the guide's shape the playtest of 2026-10-02 measured (#732), measured here
// on the built app as it is painted.

// A step that opens starts at its top. The three steps share one scrolling body, so at 768 a step
// left scrolled to its bottom handed the next one the same distance: «Nästa» opened step 3 101 px
// down, its heading above the edge and the card's top cut off — and «Föregående» back did the same.
test.describe('a step walked to at 768 × 1024', () => {
  test.use({ viewport: { width: 768, height: 1024 }, locale: 'sv-SE' })

  test('opens at its top, forward and back', async ({ page }) => {
    await logIn(page.request)
    await page.goto('/new')
    const body = page.locator('.byd-wizard-body')
    const top = () => body.evaluate((el) => el.scrollTop)
    const toBottom = async () => {
      const box = (await body.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, 4000)
      // Not vacuous: the step really was scrolled before the move that should undo it.
      await expect.poll(top).toBeGreaterThan(0)
    }

    await page.getByRole('button', { name: 'Nästa' }).click()
    await expect(page.getByRole('tab', { name: '2 · Fälten' })).toHaveAttribute('aria-selected', 'true')
    await toBottom()
    await page.getByRole('button', { name: 'Nästa' }).click()
    await expect(page.getByRole('tab', { name: '3 · Korten' })).toHaveAttribute('aria-selected', 'true')
    expect(await top()).toBe(0)
    await expect(page.locator('#byd-wizard-h3')).toBeInViewport({ ratio: 1 })

    await toBottom()
    await page.getByRole('button', { name: /Föregående/ }).click()
    await expect(page.getByRole('tab', { name: '2 · Fälten' })).toHaveAttribute('aria-selected', 'true')
    expect(await top()).toBe(0)
    await expect(page.locator('#byd-wizard-h2')).toBeInViewport({ ratio: 1 })
  })
})

// A long title on its tab: «Den gamla björnen som vaktade bron över Mörkälven i tusen år» was
// written out whole, 484 px of tab, and «Ta bort valt kort» went to a row of its own. The tab holds
// it to about 24 characters and ends it in an ellipsis; the whole of it is the tab's `title`.
test.describe('a card s tab at 1280 × 800', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('cuts a long title short, at the width of 24 characters', async ({ page }) => {
    await logIn(page.request)
    await page.goto('/new')
    const long = 'Den gamla björnen som vaktade bron över Mörkälven i tusen år'
    await page.getByLabel('kort 1 Titel').fill(long)
    const tabs = page.locator('.byd-wizard-card-tabs > button[aria-pressed]')
    // The yardstick, in whatever face this machine sets the tab in: a title of exactly 24 ch.
    await tabs.nth(1).click()
    await page.getByLabel('kort 2 Titel').fill('0'.repeat(24))

    const first = tabs.nth(0)
    await expect(first).toHaveAttribute('title', long)
    const [cut, yardstick] = await Promise.all([first.boundingBox(), tabs.nth(1).boundingBox()])
    expect(cut!.width).toBeLessThanOrEqual(yardstick!.width + 1)
    // And it is cut, not merely short: the words run on past the box that draws them.
    const title = first.locator('.byd-wizard-card-tab-title')
    expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  })
})

// The locked «Föregående» on step 1 (#416) has its fill taken away and keeps its line — a form
// measured against the paper. On the strip the two moves stand on, white at 70 %, the fill was the
// strip's own colour, so the locked button looked like an active secondary one with greyer words.
// The locked form is measured against the strip now as well: an active button's fill must stand
// out from the strip at least as much as a field's white does from the paper the form was decided
// on, and a real pointer over the locked one must not light it up.
type RGB = [number, number, number]
const luminance = ([r, g, b]: RGB) => {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const apart = (a: RGB, b: RGB) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])

/** The painted colour at each point, in CSS px of the page. */
async function paintedAt(page: Page, points: readonly { x: number; y: number }[]): Promise<RGB[]> {
  const shot = await page.screenshot()
  const size = page.viewportSize()!
  return page.evaluate(
    async ({ data, points, width }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const canvas = new OffscreenCanvas(img.width, img.height)
      const g = canvas.getContext('2d')!
      g.drawImage(img, 0, 0)
      const px = img.width / width
      return points.map(({ x, y }) => {
        const d = g.getImageData(Math.floor(x * px), Math.floor(y * px), 1, 1).data
        return [d[0]!, d[1]!, d[2]!] as [number, number, number]
      })
    },
    { data: shot.toString('base64'), points, width: size.width },
  )
}

test.describe('the locked «Föregående» at 768 × 1024', () => {
  test.use({ viewport: { width: 768, height: 1024 }, locale: 'sv-SE' })

  test('reads as locked on the strip it stands on, under the pointer too', async ({ page }) => {
    await logIn(page.request)
    await page.goto('/new')
    const back = page.getByRole('button', { name: /Föregående/ })
    await expect(back).toBeDisabled()
    await page.mouse.move(0, 0)

    const strip = (await page.locator('.byd-wizard-steps').boundingBox())!
    const name = (await page.getByLabel('Spelets namn').boundingBox())!
    const panel = (await page.locator('#byd-wizard-panel-spelet').boundingBox())!
    const box = (await back.boundingBox())!
    const mid = box.y + box.height / 2
    // The strip's own ground, its padding left of the button; the button's inside, clear of its
    // centred words; its line; and, for the reference, a field's white on the paper beside it.
    const points = [
      { x: strip.x + 4, y: mid },
      { x: box.x + 8, y: mid },
      { x: box.x + 0.5, y: mid },
      { x: name.x + 8, y: name.y + name.height / 2 },
      { x: panel.x + 4, y: panel.y + 4 },
    ]
    const [ground, locked, line, field, paper] = await paintedAt(page, points)
    const reference = contrast(field!, paper!)
    // Not vacuous: the paper and the field really are two colours, and the line is drawn.
    expect(reference).toBeGreaterThan(1.05)
    expect(apart(line!, ground!)).toBeGreaterThan(30)
    // The locked one has no fill of its own: what is inside it is the strip.
    expect(apart(locked!, ground!)).toBeLessThanOrEqual(6)

    // A real pointer over it changes nothing it paints.
    await back.hover({ force: true })
    const [, lockedOver, lineOver] = await paintedAt(page, points)
    expect(apart(lockedOver!, locked!)).toBeLessThanOrEqual(6)
    expect(apart(lineOver!, line!)).toBeLessThanOrEqual(6)

    // And the same button active, one step on: its fill stands out from the strip at least as much
    // as a field's white does from the paper, so the fill's absence is what says it is locked.
    await page.mouse.move(0, 0)
    await page.getByRole('button', { name: 'Nästa' }).click()
    await expect(back).toBeEnabled()
    const [groundOn, active] = await paintedAt(page, points.slice(0, 2))
    expect(contrast(active!, groundOn!)).toBeGreaterThanOrEqual(reference - 0.01)
  })
})

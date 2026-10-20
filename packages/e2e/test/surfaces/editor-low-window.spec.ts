import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { PHONE } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The editor and the guided start in a low window (#550, beställarens beslut 2026-09-30: B's
// reflow with A's rule for the room; L10's exception, L12's addition).
//
// A desk zoomed to 200 % is a 640 × 400 window, and at 400 % it is 320 × 256 — with the mouse the
// designer has always had in it. The frame the editor stood in was the whole window, and with the
// header, the running table's row and the stage strip all standing still there was nothing left
// for the work: 38 px of card wall at 200 %, 2 px at 400 %, no row of the card table at either, and
// no template at all, because width alone called the window a phone.
//
// In a low window the page scrolls instead. The header and its strips scroll away with it, the
// stage strip — with «Spara» and «Uppdatera bordet» — stays at the bottom, and the card wall's and
// the card table's lists are each one whole window less that strip. Every number below is asked of
// the page rather than written down, so a typeface that sets a word wider on another machine moves
// nothing here.
//
// Measured on a deck of three hundred cards: the fixture's twelve are shorter than any window, and
// a list that fits is a list whose height nobody had to give it. The deck is grouped by a column
// of its own, as a real one is, because that is what puts the group menu in the canvas crown —
// the widest thing the crown holds, and the one that was set over «Framsida».
const TYPES = ['Playcard', 'Location', 'Effect', 'Karaktär']
function deck() {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 300 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: TYPES[i % TYPES.length]! } }))
  doc.template.faces['front']!.variantBy = 'typ'
  return doc
}
const LOW = [
  { zoom: '200 %', width: 640, height: 400 },
  { zoom: '400 %', width: 320, height: 256 },
] as const

async function openEditor(page: Page) {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, deck())
  await page.goto(project.editorUrl)
  await expect(page.locator('.byd-editor-stagebar')).toBeVisible()
  // Non-vacuity: the window is the zoomed desk the decision is about — a mouse, and low.
  expect(await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches)).toBe(true)
}

async function openStage(page: Page, stage: string) {
  const tab = page.locator(`#byd-editor-tab-${stage}`)
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

// Where the page stands once the reader has scrolled to the list, as someone at work would: the
// list's top at the window's top. What is reported is the list's box, the strip's box, and where
// the header is then.
async function atTheList(page: Page, list: string) {
  return page.evaluate((selector) => {
    const box = (el: Element | null) => {
      const r = el!.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom, height: r.height }
    }
    const el = document.querySelector(selector)!
    window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY)
    return {
      list: box(el),
      strip: box(document.querySelector('.byd-editor-stagebar')),
      header: box(document.querySelector('.byd-editor > header')),
      window: window.innerHeight,
    }
  }, list)
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

for (const { zoom, width, height } of LOW) {
  test.describe(`the editor at ${zoom} (${width} × ${height}, a mouse)`, () => {
    test.use({ viewport: { width, height }, locale: 'sv-SE' })

    test('keeps the template, and never scrolls sideways', async ({ page }) => {
      await openEditor(page)
      await expect(page.locator('#byd-editor-tab-canvas')).toHaveCount(1)
      await expect(page.getByText(/Mallen ritas inte på telefon/)).toHaveCount(0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })

    // The three surfaces the work is done on: the card wall's list, the card table's rows, and the
    // canvas stage's room the card is drawn in. At 400 % the canvas crown takes three rows, and in a
    // frame that stood still the room under it was nothing at all.
    for (const [stage, list, name] of [
      ['wall', '.byd-wall-work', 'card wall'],
      ['table', '.byd-data-scroll', 'card table'],
      ['canvas', '.byd-canvas-room', 'canvas'],
    ] as const) {
      test(`gives the ${name} a whole window less the stage strip`, async ({ page }) => {
        await openEditor(page)
        await openStage(page, stage)
        const at = await atTheList(page, list)
        // The strip stands at the bottom of the window wherever the page is.
        expect(Math.abs(at.strip.bottom - at.window)).toBeLessThanOrEqual(1)
        // The list is the window less the strip, and all of it is in view above the strip.
        expect(Math.abs(at.list.height - (at.window - at.strip.height))).toBeLessThanOrEqual(1)
        expect(Math.abs(at.list.top)).toBeLessThanOrEqual(1)
        expect(at.list.bottom).toBeLessThanOrEqual(at.strip.top + 1)
        // And the header has scrolled away with the page to make that room.
        expect(at.header.bottom).toBeLessThanOrEqual(0)
        expect(await sideways(page)).toBeLessThanOrEqual(0)
      })
    }

    // The canvas had never been drawn under 768 px before the pointer rule offered it there, and it
    // showed: at 640 the zoom band stood up out of a room too short for it and over «Baksida», and
    // at 320 the crown's words were set over one another. Every control the crown and the band
    // draw must stand clear of every other.
    test('draws the canvas crown and the zoom band without one control over another', async ({ page }) => {
      await openEditor(page)
      await openStage(page, 'canvas')
      await expect(page.locator('.byd-canvas-zoom')).toBeVisible()
      const overlaps = await page.evaluate(() => {
        const controls = [...document.querySelectorAll<HTMLElement>('.byd-canvas-strip :is(button, select, label), .byd-canvas-zoom :is(button, input, output)')]
          .map((el) => ({ name: `${el.tagName.toLowerCase()} «${(el.textContent ?? '').trim().slice(0, 24) || el.getAttribute('aria-label') || ''}»`, r: el.getBoundingClientRect(), el }))
          .filter(({ r }) => r.width > 0 && r.height > 0)
        const found: string[] = []
        for (let i = 0; i < controls.length; i++)
          for (let j = i + 1; j < controls.length; j++) {
            const a = controls[i]!
            const b = controls[j]!
            // A label holds its select, and that is one control and not two.
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue
            const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
            const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
            if (x > 1 && y > 1) found.push(`${a.name} × ${b.name}`)
          }
        // And nothing stands past the window's right edge, where it could only be reached sideways.
        for (const { name, r } of controls) if (r.right > window.innerWidth + 1) found.push(`${name} past the edge`)
        return { found, measured: controls.length }
      })
      expect(overlaps.measured, 'the crown and the band have controls to measure').toBeGreaterThan(5)
      expect(overlaps.found).toEqual([])
      // And no control's words run out of its own box, where they would be set over the next one's.
      const spilt = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('.byd-canvas-strip button, .byd-canvas-zoom button')].filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => (el.textContent ?? '').trim()),
      )
      expect(spilt).toEqual([])
    })

    test('shows whole rows of the card table', async ({ page }) => {
      await openEditor(page)
      await openStage(page, 'table')
      await atTheList(page, '.byd-data-scroll')
      const rows = await page.evaluate(() => {
        const list = document.querySelector('.byd-data-scroll')!.getBoundingClientRect()
        const floor = Math.min(list.bottom, document.querySelector('.byd-editor-stagebar')!.getBoundingClientRect().top)
        // Under the table's own head, which stands at the top of the list.
        const head = document.querySelector('.byd-data-scroll thead')?.getBoundingClientRect().bottom ?? list.top
        return [...document.querySelectorAll('.byd-data-scroll tbody tr')].filter((tr) => {
          const r = tr.getBoundingClientRect()
          return r.height > 0 && r.top >= head - 1 && r.bottom <= floor + 1
        }).length
      })
      expect(rows).toBeGreaterThanOrEqual(2)
    })
  })
}

// The stage strip's own edges at 400 % (#763). The strip scrolls sideways there, and the label it
// cut stopped mid-word right against «Spara» — «Verktyg» read as lying under the button. The tool's
// one gesture for cut text is a fade to nothing at the edge, never a hard stop (#46, #53), so a
// label the strip cuts now fades out before the edge, at whichever end it is cut, and a label the
// strip does not cut is painted at full strength.
//
// Measured on what is painted, so no typeface decides it: the strip is scrolled until the edge runs
// through the middle of a label's words, and the last few pixels inside that edge must be the
// strip's own ground. Before the fix they held the label's ink.
test.describe('the stage strip at 400 % (320 × 256, a mouse)', () => {
  test.use({ viewport: { width: 320, height: 256 }, locale: 'sv-SE' })

  type Edge = 'start' | 'end'
  const BAND = 3

  // Scrolls the strip so that `edge` cuts through the middle of an unselected label, and says
  // where that label's words stand vertically.
  async function cutALabel(page: Page, edge: Edge | 'none') {
    return page.evaluate(async (edge) => {
      const list = document.querySelector<HTMLElement>('.byd-editor-stagebar [role="tablist"]')!
      const max = list.scrollWidth - list.clientWidth
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      if (edge === 'none') {
        list.scrollLeft = 0
        await frame()
        const tab = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!
        const range = document.createRange()
        range.selectNodeContents(tab)
        const r = range.getBoundingClientRect()
        return { max, top: r.top, bottom: r.bottom, left: r.left, right: r.right, label: tab.textContent }
      }
      for (const tab of list.querySelectorAll<HTMLElement>('[role="tab"]:not([aria-selected="true"])')) {
        list.scrollLeft = 0
        const range = document.createRange()
        range.selectNodeContents(tab)
        const text = range.getBoundingClientRect()
        const box = list.getBoundingClientRect()
        const mid = text.left - box.left + text.width / 2
        const want = Math.round(edge === 'end' ? mid - list.clientWidth : mid)
        if (want <= 0 || want >= max) continue
        list.scrollLeft = want
        await frame()
        const r = range.getBoundingClientRect()
        return { max, top: r.top, bottom: r.bottom, left: r.left, right: r.right, label: tab.textContent }
      }
      return null
    }, edge)
  }

  // The strongest difference from the strip's own ground, over a band of `BAND` CSS px just inside
  // the strip's `edge` (or a label's left, for `edge: none`) and across the label's words.
  async function inkAt(page: Page, x: number, top: number, bottom: number) {
    const bar = (await page.locator('.byd-editor-stagebar').boundingBox())!
    const shot = await page.screenshot({ clip: { x: bar.x, y: bar.y, width: bar.width, height: bar.height } })
    return page.evaluate(
      async ({ data, scale, x, top, bottom, band }) => {
        const img = new Image()
        img.src = `data:image/png;base64,${data}`
        await img.decode()
        const canvas = new OffscreenCanvas(img.width, img.height)
        const g = canvas.getContext('2d')!
        g.drawImage(img, 0, 0)
        const px = img.width / scale
        // The ground is read off the strip's own padding, above everything it holds.
        const ground = g.getImageData(1, 1, 1, 1).data
        const pixels = g.getImageData(Math.round(x * px), Math.round(top * px), Math.max(1, Math.round(band * px)), Math.max(1, Math.round((bottom - top) * px))).data
        let most = 0
        for (let i = 0; i < pixels.length; i += 4)
          most = Math.max(most, Math.abs(pixels[i]! - ground[0]!), Math.abs(pixels[i + 1]! - ground[1]!), Math.abs(pixels[i + 2]! - ground[2]!))
        return most
      },
      { data: shot.toString('base64'), scale: bar.width, x: x - bar.x, top: top - bar.y, bottom: bottom - bar.y, band: BAND },
    )
  }

  test('fades a label it cuts out before the edge, at either end, and leaves a whole one whole', async ({ page }) => {
    await openEditor(page)
    await page.mouse.move(0, 0)
    const list = page.locator('.byd-editor-stagebar [role="tablist"]')
    const box = (await list.boundingBox())!

    // A label the strip does not cut is painted at full strength: the selected one, at the start.
    const whole = (await cutALabel(page, 'none'))!
    expect(whole.max, 'the stages do not fit, so the strip scrolls').toBeGreaterThan(0)
    expect(await inkAt(page, whole.left, whole.top, whole.bottom), `«${whole.label}» is painted`).toBeGreaterThan(80)

    for (const edge of ['end', 'start'] as const) {
      const cut = await cutALabel(page, edge)
      expect(cut, `a label can be cut at the ${edge}`).not.toBeNull()
      const x = edge === 'end' ? box.x + box.width - BAND : box.x
      expect(await inkAt(page, x, cut!.top, cut!.bottom), `«${cut!.label}» cut at the strip's ${edge}`).toBeLessThan(32)
    }
  })
})

// The phone is the one narrow window the rule leaves where it was (L12, L10): a finger and no
// hover is the phone's, and it keeps the honest room — no canvas, and a sentence saying why —
// standing still in a window tall enough for it.
test.describe('the editor on a phone', () => {
  test.use({ viewport: PHONE.viewport, hasTouch: true, isMobile: true, locale: 'sv-SE' })

  test('keeps the room it has always had, and the page stands still', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProjectOf(page.request, deck())
    await page.goto(project.editorUrl)
    await expect(page.locator('.byd-editor')).toHaveAttribute('data-room', 'phone')
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
    await expect(page.getByText(/Mallen ritas inte på telefon/)).toBeVisible()
    await expect(page.locator('#byd-editor-tab-canvas')).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBeLessThanOrEqual(0)
  })
})

// The guided start does the same (#550): at 400 % it had 23 px for the step between its head, its
// step strip and its two moves, all standing still. Now the page scrolls, and only «Föregående» and
// «Nästa» stay, at the bottom where they were.
for (const { zoom, width, height } of LOW) {
  test.describe(`the guided start at ${zoom} (${width} × ${height}, a mouse)`, () => {
    test.use({ viewport: { width, height }, locale: 'sv-SE' })

    test('gives the step the whole window less its two moves, and never scrolls sideways', async ({ page }) => {
      await logIn(page.request)
      await page.goto('/new')
      await page.getByLabel('Spelets namn').waitFor()
      await expect(page.locator('.byd-wizard')).toHaveAttribute('data-room', 'steps')
      const at = await page.evaluate(() => {
        const box = (el: Element | null) => {
          const r = el!.getBoundingClientRect()
          return { top: r.top, bottom: r.bottom, height: r.height }
        }
        const panel = document.querySelector('.byd-wizard-body > [role="tabpanel"]:not([hidden])')!
        window.scrollTo(0, panel.getBoundingClientRect().top + window.scrollY)
        return { panel: box(panel), moves: box(document.querySelector('nav.byd-wizard-steps')), header: box(document.querySelector('.byd-wizard > header')), window: window.innerHeight }
      })
      expect(Math.abs(at.moves.bottom - at.window)).toBeLessThanOrEqual(1)
      expect(Math.abs(at.panel.top)).toBeLessThanOrEqual(1)
      // What the step has to be read in: from the window's top to the two moves.
      expect(at.moves.top - Math.max(0, at.panel.top)).toBeGreaterThanOrEqual(at.window - at.moves.height - 1)
      expect(at.header.bottom).toBeLessThanOrEqual(0)
      await expect(page.locator('nav.byd-wizard-steps').getByRole('button', { name: 'Nästa' })).toBeInViewport({ ratio: 1 })
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  })
}

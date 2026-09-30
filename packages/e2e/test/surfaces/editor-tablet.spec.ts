import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { DESK, TABLETS } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The editor on a tablet (#567, beställarens beslut 2026-09-30: B; L12's addition). On a Galaxy
// Tab the crown and the card table's filters scrolled sideways inside their rows, and the stage
// strip hid Media, Regler and Bord behind «Spara» and «Uppdatera bordet». Under a finger a row
// breaks instead; where the window is tall enough for the header to stand, the two actions stand
// in it as they do at the desk, and the strip is the stages' own. In a low window (#550) the
// header scrolls away, so there they stay at the strip's end.
//
// Every control the chrome holds must be wholly on the screen and inside every box that clips it,
// on every stage, as the editor opens. Lists — the wall's cards, the table's rows, the canvas —
// scroll by nature and are left out.
const TYPES = ['Playcard', 'Location', 'Effect', 'Karaktär', 'Character', 'Shopcard', 'Trap-', 'Trap+']
const RARITY = ['Diamant', 'Guld', 'Karaktär', 'Koppar', 'Silver', 'Special']
function deck() {
  const doc = gameDoc({ name: "Sal's Saloon", cards: 96 })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: TYPES[i % TYPES.length]!, raritet: RARITY[i % RARITY.length]! } }))
  doc.template.faces['front']!.variantBy = 'typ'
  return doc
}

async function openEditor(page: Page) {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, deck())
  await page.goto(project.editorUrl)
  await expect(page.locator('.byd-editor')).toBeVisible()
}

// The chrome's controls that are not wholly visible: outside the window, or cut by an ancestor
// that clips sideways.
const cut = (page: Page) =>
  page.evaluate(() => {
    const list = '.byd-data-scroll, .byd-wall-deck, .byd-canvas-stage, .byd-layer-list, .byd-rules-book'
    const out: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('.byd-editor button, .byd-editor [role=tab], .byd-editor a[href], .byd-editor input, .byd-editor select, .byd-editor summary')) {
      if (el.closest(list)) continue
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === 'hidden') continue
      let left = Math.max(r.left, 0)
      let right = Math.min(r.right, innerWidth)
      for (let a = el.parentElement; a; a = a.parentElement) {
        if (getComputedStyle(a).overflowX === 'visible') continue
        const b = a.getBoundingClientRect()
        left = Math.max(left, b.left)
        right = Math.min(right, b.right)
      }
      if (right - left < r.width - 1) out.push((el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 40))
    }
    return out
  })

const stages = (page: Page) => page.locator('.byd-editor [role=tab][id^="byd-editor-tab-"]').evaluateAll((tabs) => tabs.map((t) => t.id))

for (const device of TABLETS) {
  const { width, height } = device.viewport
  test.describe(`the editor on a tablet, ${width} × ${height}`, () => {
    test.use({ viewport: device.viewport, hasTouch: true, isMobile: true, locale: 'sv-SE' })

    test('hides no control of its chrome sideways, on any stage', async ({ page }) => {
      await openEditor(page)
      // Non-vacuity: this is a finger, and the page is one the chrome could overflow.
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true)
      const ids = await stages(page)
      expect(ids.length).toBeGreaterThanOrEqual(6)
      for (const id of ids) {
        await page.locator(`#${id}`).evaluate((el: HTMLElement) => el.click())
        await expect(page.locator(`#${id}`)).toHaveAttribute('aria-selected', 'true')
        await page.evaluate(() => window.scrollTo(0, 0))
        expect({ stage: id, cut: await cut(page) }).toEqual({ stage: id, cut: [] })
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    })

    const tall = height > 560
    test(tall ? 'keeps «Spara» and «Uppdatera bordet» in the header, and gives the strip to the stages' : 'keeps «Spara» and «Uppdatera bordet» at the end of the strip that stays', async ({ page }) => {
      await openEditor(page)
      const where = await page.evaluate(() => {
        const place = (b: Element | null | undefined) => (b?.closest('header') ? 'header' : b?.closest('.byd-editor-stagebar') ? 'strip' : 'none')
        const at = (name: RegExp) => place([...document.querySelectorAll('button')].find((x) => name.test(x.textContent ?? '')))
        return { save: at(/^Spara$/), update: place(document.querySelector('.byd-editor-primary')) }
      })
      const room = await page.locator('.byd-editor').getAttribute('data-room')
      if (room === 'desk') expect(where).toEqual({ save: 'header', update: 'header' })
      else if (tall) expect(where).toEqual({ save: 'header', update: 'header' })
      else expect(where).toEqual({ save: 'strip', update: 'strip' })
    })
  })
}

// The desk pays nothing (L12): its crown is one row, as it was.
test.describe('the editor at the desk', () => {
  test.use({ viewport: DESK.viewport, locale: 'sv-SE' })
  test('keeps the card wall’s crown to one row', async ({ page }) => {
    await openEditor(page)
    const crown = page.locator('.byd-crown').first()
    await expect(crown).toBeVisible()
    const rows = await crown.evaluate((el) => new Set([...el.children].map((c) => Math.round(c.getBoundingClientRect().top))).size)
    expect(rows).toBe(1)
  })
})

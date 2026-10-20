import type { Page } from '@playwright/test'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'
import { expect, test } from '../../support/test.js'

// The jump column folds itself (#1019, variant C, beställarens val 2026-10-20). The control left the
// crown, where at a narrow crown it was a lone «⟨» painted 2.2:1 on a plain screen and sat to the left
// of its own box, and stands on the column it folds: in the open column's head beside «Leken», and at
// the top of the folded strip — the AI panel's own ⟩, mirrored on the wall's other side.
//
// Measured in the built app at the three desks the prototype measured: 1100 with nothing beside the
// wall but the AI panel's folded tab, 1280 beside the open AI panel, and 1440. In the machine's own
// face and in a wide one (Verdana, DejaVu's width), because CI's Linux draws DejaVu and a Mac that
// fits is not a runner that fits (#1045). At one device pixel per px, where the old sign failed.
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefC4C4'
const WIDE = ".byd-wall-view * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"
const WORDS: Record<string, { in: string; out: string }> = {
  'sv-SE': { in: 'Fäll ihop hoppspalten', out: 'Fäll ut hoppspalten' },
  'en-GB': { in: 'Fold the jump column', out: 'Unfold the jump column' },
}

function deck(types: readonly string[], cards: number) {
  const doc = gameDoc({ name: "Sal's Saloon", cards })
  doc.rows = doc.rows.map((row, i) => ({ ...row, fields: { ...row.fields, typ: types[i % types.length]! } }))
  doc.template.faces['front']!.variantBy = 'typ'
  return doc
}
const EIGHT = ['Playcard', 'Location', 'Effect', 'Karaktär', 'Character', 'Shopcard', 'Trap-', 'Trap+']

const lost = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null)

// The control as it stands: its box, whether anything cuts it — or, with the focus on it, its ring —
// and the crown's row above the wall.
const standing = (page: Page, selector: string) =>
  page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement
    const r = el.getBoundingClientRect()
    const focused = document.activeElement === el
    const style = getComputedStyle(el)
    const ring = focused && style.outlineStyle !== 'none' ? parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset) : 0
    let [left, top, right, bottom] = [r.left - ring, r.top - ring, r.right + ring, r.bottom + ring]
    const want = [left, top, right, bottom]
    left = Math.max(left, 0)
    top = Math.max(top, 0)
    right = Math.min(right, innerWidth)
    bottom = Math.min(bottom, innerHeight)
    for (let a = el.parentElement; a; a = a.parentElement) {
      const s = getComputedStyle(a)
      const b = a.getBoundingClientRect()
      const bl = b.left + parseFloat(s.borderLeftWidth)
      const bt = b.top + parseFloat(s.borderTopWidth)
      const br = b.right - parseFloat(s.borderRightWidth)
      const bb = b.bottom - parseFloat(s.borderBottomWidth)
      if (s.overflowX !== 'visible') [left, right] = [Math.max(left, bl), Math.min(right, br)]
      if (s.overflowY !== 'visible') [top, bottom] = [Math.max(top, bt), Math.min(bottom, bb)]
    }
    const cut = left > want[0]! + 0.5 || top > want[1]! + 0.5 || right < want[2]! - 0.5 || bottom < want[3]! - 0.5
    // The ground the control is drawn on, as the stylesheet declares it: the nearest painted ancestor.
    let declared = 'rgb(0, 0, 0)'
    for (let a = el.parentElement; a; a = a.parentElement) {
      const colour = getComputedStyle(a).backgroundColor
      if (colour !== 'transparent' && !/,\s*0\)$/.test(colour)) {
        declared = colour
        break
      }
    }
    const crown = document.querySelector('.byd-wall-view .byd-crown') as HTMLElement
    const tools = [...crown.children].filter((c) => getComputedStyle(c).display !== 'none')
    return {
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      w: Math.round(r.width),
      h: Math.round(r.height),
      ring,
      cut,
      declared: (declared.match(/\d+/g) ?? []).slice(0, 3).map(Number),
      crownRows: new Set(tools.map((c) => Math.round(c.getBoundingClientRect().top))).size,
      crownOver: crown.scrollWidth - crown.clientWidth,
      crownFold: crown.querySelectorAll('.byd-wall-fold, [aria-controls]').length,
      crownSays: crown.textContent ?? '',
    }
  }, selector)

// What reaches the eye: the control's box photographed and read back. The ground is the colour most
// of the box is painted in, and the ink the pixel that stands furthest from it; `inked` counts the
// pixels that make 3:1, so a stray pixel of anti-aliasing cannot pass for a sign.
const painted = async (page: Page, clip: { x: number; y: number; width: number; height: number }) => {
  const shot = await page.screenshot({ clip })
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = new OffscreenCanvas(img.width, img.height)
    const g = canvas.getContext('2d')!
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, img.width, img.height).data
    const lin = (c: number) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    const lum = (p: number[]) => 0.2126 * lin(p[0]!) + 0.7152 * lin(p[1]!) + 0.0722 * lin(p[2]!)
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)]
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    const counts = new Map<string, number>()
    for (let i = 0; i < d.length; i += 4) {
      const key = `${d[i]},${d[i + 1]},${d[i + 2]}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const ground = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0].split(',').map(Number)
    let ink = ground
    let inked = 0
    for (let i = 0; i < d.length; i += 4) {
      const p = [d[i]!, d[i + 1]!, d[i + 2]!]
      if (ratio(p, ground) > ratio(ink, ground)) ink = p
      if (ratio(p, ground) >= 3) inked++
    }
    return { ground, ink, ratio: Math.round(ratio(ink, ground) * 100) / 100, inked }
  }, shot.toString('base64'))
}

const DESKS = [
  { width: 1100, height: 800, beside: false },
  { width: 1280, height: 800, beside: true },
  { width: 1440, height: 900, beside: false },
] as const

for (const locale of ['sv-SE', 'en-GB']) {
  const words = WORDS[locale]!
  for (const desk of DESKS) {
    test.describe(`the jump column's fold at ${desk.width} × ${desk.height}${desk.beside ? ' beside the open AI panel' : ''} in ${locale} (#1019)`, () => {
      test.use({ viewport: { width: desk.width, height: desk.height }, deviceScaleFactor: 1, locale, reducedMotion: 'reduce' })

      test('stands on the column it folds, seen, a tap target, and followed by the focus both ways', async ({ page }) => {
        await logIn(page.request)
        if (desk.beside) expect((await page.request.put('/me/ai-key', { data: { provider: 'anthropic', key: KEY } })).status()).toBe(200)
        const project = await makeProjectOf(page.request, deck(EIGHT, 48))
        await page.goto(project.editorUrl)
        await expect(page.locator('.byd-wall-card').first()).toBeVisible()
        // Non-vacuity: the panel stands open beside the wall where it is named, and is only its
        // folded tab where it is not.
        await expect(page.locator('.byd-ai[data-open]')).toHaveCount(desk.beside ? 1 : 0)
        const head = '.byd-wall-jump .byd-wall-fold'
        const strip = '.byd-wall-rail .byd-wall-fold'

        const holds = async (selector: string, where: string) => {
          await page.mouse.move(desk.width / 2, desk.height - 4)
          const m = await standing(page, selector)
          expect([m.w, m.h], `${where}: a 44 × 44 target`).toEqual([44, 44])
          expect(m.cut, `${where}: nothing cuts the control${m.ring ? ' or its focus ring' : ''}`).toBe(false)
          expect(m.crownFold, `${where}: the crown carries no fold`).toBe(0)
          expect(m.crownSays).not.toContain(words.in)
          expect(m.crownSays).not.toContain(words.out)
          expect(m.crownRows, `${where}: the crown stands on one row`).toBe(1)
          expect(m.crownOver, `${where}: the crown does not overflow`).toBeLessThanOrEqual(0)
          const paint = await painted(page, m.rect)
          // Non-vacuity: what was read as the ground is the ground the column declares.
          expect(paint.ground.map((c, i) => Math.abs(c - m.declared[i]!)).every((d) => d <= 2), `${where}: read on the column's own ground ${m.declared} and not ${paint.ground}`).toBe(true)
          expect(paint.ratio, `${where}: the sign against its ground, painted`).toBeGreaterThanOrEqual(3)
          expect(paint.inked, `${where}: the sign is drawn, not a stray pixel`).toBeGreaterThanOrEqual(12)
          return m
        }

        for (const face of ['system-ui', 'wide']) {
          const wide = face === 'wide' ? await page.addStyleTag({ content: WIDE }) : null
          // Open: in the column's head, beside its name.
          await expect(page.locator(head)).toHaveAccessibleName(words.in)
          await expect(page.locator(head)).toHaveAttribute('aria-expanded', 'true')
          await expect(page.locator(head)).toHaveAttribute('aria-controls', (await page.locator('.byd-wall-jump').getAttribute('id'))!)
          await holds(head, `${face}, open`)

          // Under a keyboard: the press takes the pressed button away, and the focus goes to the one
          // that took its place — with its ring whole.
          await page.locator(head).focus()
          await page.keyboard.press('Enter')
          await expect(page.locator(strip)).toBeFocused()
          expect(await lost(page)).toBe(false)
          await expect(page.locator(strip)).toHaveAccessibleName(words.out)
          await expect(page.locator(strip)).toHaveAttribute('aria-expanded', 'false')
          await expect(page.locator(strip)).toHaveAttribute('aria-controls', (await page.locator('.byd-wall-rail').getAttribute('id'))!)
          await expect(page.locator('.byd-wall-jump')).toHaveCount(0)
          expect((await holds(strip, `${face}, folded, focused`)).ring, 'the ring is drawn').toBeGreaterThan(0)
          await page.keyboard.press('Space')
          await expect(page.locator(head)).toBeFocused()
          expect(await lost(page)).toBe(false)
          expect((await holds(head, `${face}, open, focused`)).ring, 'the ring is drawn').toBeGreaterThan(0)

          // Under a pointer, both ways.
          await page.locator(head).click()
          await expect(page.locator('.byd-wall-rail')).toBeVisible()
          expect(await lost(page)).toBe(false)
          await page.locator(strip).click()
          await expect(page.locator('.byd-wall-jump')).toBeVisible()
          expect(await lost(page)).toBe(false)
          await wide?.evaluate((tag) => (tag as Element).remove())
        }
      })
    })
  }
}

// A deck of many groups (#1019): the strip gives the control a tile's room at its top, so it starts
// scrolling a tile sooner. The control stays put while the tiles scroll under it, and every tile is
// still a tap target both ways — the deck L21 measured on, scaled through the API to 30 groups.
test.describe('the folded strip of a deck with many groups (#1019)', () => {
  test.use({ viewport: { width: 1100, height: 800 }, locale: 'sv-SE', reducedMotion: 'reduce' })

  test('keeps its way back out in sight however far the tiles are scrolled', async ({ page }) => {
    await logIn(page.request)
    const types = Array.from({ length: 30 }, (_, i) => `Grupp ${String(i + 1).padStart(2, '0')}`)
    const project = await makeProjectOf(page.request, deck(types, 300))
    await page.goto(project.editorUrl)
    await expect(page.locator('.byd-wall-card').first()).toBeVisible()
    await page.locator('.byd-wall-jump .byd-wall-fold').click()
    const strip = page.locator('.byd-wall-rail .byd-wall-fold')
    await expect(strip).toBeVisible()
    const scroll = page.locator('.byd-wall-rail-scroll')
    const before = await strip.boundingBox()
    // Non-vacuity: thirty tiles do not fit, so the strip scrolls.
    expect(await scroll.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0)
    await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight))
    expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    const tiles = await page.locator('[data-tile]').evaluateAll((els) => els.map((el) => [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)]))
    expect(tiles).toHaveLength(30)
    expect(tiles.filter(([w, h]) => w! < 44 || h! < 44)).toEqual([])
    expect(await strip.boundingBox()).toEqual(before)
    const m = await standing(page, '.byd-wall-rail .byd-wall-fold')
    expect(m.cut).toBe(false)
    // And the last tile is not under it: the tiles scroll in a box of their own, below the control.
    const last = (await page.locator('[data-tile]').last().boundingBox())!
    expect(last.y).toBeGreaterThanOrEqual(before!.y + before!.height)
    await strip.click()
    await expect(page.locator('.byd-wall-jump')).toBeVisible()
  })
})

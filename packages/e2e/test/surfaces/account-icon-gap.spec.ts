import type { Locator, Page } from '@playwright/test'
import { logIn } from '../../support/api.js'
import { expect, test } from '../../support/test.js'

// The room between a button's glyph and its words on the account pages (#1245). «Spara passkey i
// den här webbläsaren» on the profile (#1180) drew its key flush against the S, while every other
// button on these pages that carries a glyph beside its words — «Logga in med passkey», «Importera»
// on Mina spel, the landing page's two ways in — keeps one step of the spacing ladder between them.
//
// Two facts per button, and neither is a text width. The step: the distance the browser laid out
// between the glyph's box and the words' box, which the stylesheet names and which no typeface can
// move — it has to be one rung of the ladder, and the same rung on every button here. And what the
// reader sees: the run of clear columns between the glyph's last painted pixel and the first
// painted pixel of the words, read off a photograph of the button. That run is the step plus
// whatever room the glyph and the first letter leave inside their own boxes, so it can never be
// less than the step — and a button with no gap paints a run of a pixel or two, which is what the
// audit's photograph showed.

// The ladder, as `--byd-s1` … `--byd-s5` in `editor.css` name it.
const LADDER = [4, 8, 12, 16, 24]
const WIDTHS = [1024, 1280, 1440] as const

type Gap = { what: string; step: number; painted: number }

/** The laid-out and the painted room between a button's glyph and the words beside it. */
async function gapOf(page: Page, button: Locator, what: string): Promise<Gap> {
  await button.scrollIntoViewIfNeeded()
  await expect(button).toBeVisible()
  const laid = await button.evaluate((el) => {
    const glyph = el.querySelector(':scope > svg.byd-glyph')
    if (!glyph) throw new Error('no glyph of its own')
    // The words are the glyph's neighbour: a bare text node, or the span that holds them.
    const said = (n: ChildNode | null) => !!n && !!(n.textContent ?? '').trim()
    const before = said(glyph.nextSibling)
    const words = before ? glyph.nextSibling : glyph.previousSibling
    if (!words || !(words.textContent ?? '').trim()) throw new Error('no words beside the glyph')
    const range = document.createRange()
    range.selectNodeContents(words)
    const lines = [...range.getClientRects()]
    const g = glyph.getBoundingClientRect()
    // The line the glyph stands beside: the first when the words follow it, the last when they lead.
    const line = before ? lines[0]! : lines.at(-1)!
    return {
      before,
      step: before ? line.left - g.right : g.left - line.right,
      clip: { x: Math.min(g.left, line.left), y: g.top, width: Math.max(g.right, line.right) - Math.min(g.left, line.left), height: g.height },
      glyph: { from: g.left, to: g.right },
    }
  })
  const clip = { x: Math.floor(laid.clip.x), y: Math.floor(laid.clip.y), width: Math.ceil(laid.clip.width), height: Math.ceil(laid.clip.height) }
  const png = await page.screenshot({ clip })
  const painted = await page.evaluate(
    async ({ b64, glyph, before, left }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const canvas = new OffscreenCanvas(img.width, img.height)
      const g = canvas.getContext('2d')!
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, img.width, img.height).data
      // The ground is the colour most of the strip is painted in: the card, or the button's own fill.
      const count = new Map<number, number>()
      for (let i = 0; i < d.length; i += 4) {
        const k = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!
        count.set(k, (count.get(k) ?? 0) + 1)
      }
      const ground = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0]
      const [r, gr, b] = [(ground >> 16) & 255, (ground >> 8) & 255, ground & 255]
      // A column is ink when any pixel in it stands clear of the ground, antialiasing included.
      const ink = Array.from({ length: img.width }, (_, x) => {
        for (let y = 0; y < img.height; y++) {
          const i = (y * img.width + x) * 4
          if (Math.max(Math.abs(d[i]! - r), Math.abs(d[i + 1]! - gr), Math.abs(d[i + 2]! - b)) > 24) return true
        }
        return false
      })
      const from = Math.max(0, Math.floor(glyph.from - left))
      const to = Math.min(img.width, Math.ceil(glyph.to - left))
      const inGlyph = ink.map((v, x) => v && x >= from && x < to)
      if (before) {
        const edge = inGlyph.lastIndexOf(true)
        const next = ink.findIndex((v, x) => v && x > edge)
        if (edge < 0 || next < 0) return -1
        return next - edge - 1
      }
      const edge = inGlyph.indexOf(true)
      const prev = ink.findLastIndex((v, x) => v && x < edge)
      if (edge < 0 || prev < 0) return -1
      return edge - prev - 1
    },
    { b64: png.toString('base64'), glyph: laid.glyph, before: laid.before, left: clip.x },
  )
  return { what, step: Math.round(laid.step * 100) / 100, painted }
}

for (const width of WIDTHS) {
  test.describe(`the glyph and its words on the account pages at ${width}px (#1245)`, () => {
    test.use({ viewport: { width, height: 900 }, locale: 'sv-SE' })

    test('keeps one step of the ladder between them on every button, the profile’s passkey button too', async ({ page }) => {
      const gaps: Gap[] = []
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1, name: 'Bygg ditt kortspel. Spela det i kväll.' })).toBeVisible()
      gaps.push(await gapOf(page, page.locator('a.byd-landing-btn[data-landing-door="build"]'), 'Börja bygga'))
      gaps.push(await gapOf(page, page.locator('a.byd-landing-btn[data-landing-door="end"]'), 'Till editorn'))

      await page.goto('/login')
      gaps.push(await gapOf(page, page.getByRole('button', { name: 'Logga in med passkey' }), 'Logga in med passkey'))

      await logIn(page.request)
      await page.goto('/')
      gaps.push(await gapOf(page, page.locator('.byd-home-bar .byd-home-import'), 'Importera'))

      await page.goto('/profile')
      gaps.push(await gapOf(page, page.getByRole('button', { name: 'Spara passkey i den här webbläsaren' }), 'Spara passkey i den här webbläsaren'))

      // One rung, the same on every button: the first button's is the one the rest are held to.
      const step = gaps[0]!.step
      expect(LADDER, `${step} px is not a rung of the ladder`).toContain(step)
      // The reader sees at least that much clear ground between the glyph and the words.
      expect(gaps.filter((g) => g.painted < step).map(({ what, painted }) => `${what}: ${painted} px`)).toEqual([])
      expect(gaps.map(({ what, step }) => ({ what, step }))).toEqual(gaps.map(({ what }) => ({ what, step })))
    })
  })
}

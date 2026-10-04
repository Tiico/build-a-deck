import { expect, test, type Page } from '@playwright/test'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Speltema's «Visa temana i sina typsnitt» (L57, beställarens val C) as the designer reads it
// (#741, beställarens val A 2026-10-04): each tile draws a crop of the game's first card — the
// title band and the first lines of its body text — at a size where the body text can be read,
// so the body family is half of what is chosen and can be judged too (K26).
//
// Measured as relations and never as Mac pixels (CI sets the words in DejaVu): the body text's
// computed size times the zoom it is drawn at, against the floor the decision names for each
// width; the crop against the prose box it is centred on; tiles against each other.

const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const SHEET = (family: string) => `/* latin */
@font-face { font-family: '${family}'; font-weight: 200 900; src: url(https://fonts.gstatic.com/s/x/latin.woff2) format('woff2'); }
`
const WOFF2 = Buffer.from([119, 79, 70, 50, 0, 1, 0, 0])

// The floor per width (#741): K26's 12 px where the tile has the room, and 11 at 1024 where four
// tiles share the column.
const WIDTHS = [
  { width: 1280, height: 800, floorPx: 12 },
  { width: 1024, height: 768, floorPx: 11 },
] as const

// The sample deck's own template, and a plain one whose prose box stands somewhere else entirely —
// so the crop is found from the template and not from millimetres that suit one of them.
const DECKS = {
  spelkort: () => spelkortDoc(4) as unknown as ProjectDoc,
  plain: () => gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc,
} as const

async function openTheme(page: Page, doc: ProjectDoc, lang = 'sv'): Promise<void> {
  await page.route(GOOGLE, (route) => {
    const url = route.request().url()
    const family = new URL(url).searchParams.get('family')?.split(':')[0] ?? 'Cinzel'
    return url.includes('googleapis.com') ? route.fulfill({ status: 200, contentType: 'text/css', body: SHEET(family) }) : route.fulfill({ status: 200, contentType: 'font/woff2', body: WOFF2 })
  })
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(`${project.editorUrl}&lang=${lang}`)
  await page.locator('#byd-editor-tab-theme').click()
  await expect(page.locator('.byd-theme-tile')).toHaveCount(4)
}

async function showFaces(page: Page): Promise<void> {
  await page.locator('.byd-theme-show').click()
  await expect(page.locator('.byd-theme-tile [data-theme-card]')).toHaveCount(4)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

// What each tile's crop shows of the body text: the size the reader sees, and where the prose box
// stands in the crop.
async function proofs(page: Page) {
  return page.locator('.byd-theme-tile [data-theme-card]').evaluateAll((crops) =>
    crops.map((crop) => {
      const id = (crop as HTMLElement).dataset['prose'] ?? ''
      const body = crop.querySelector<HTMLElement>(`[data-element="${CSS.escape(id)}"]`)
      if (!body) return { found: false, px: 0, centredBy: Infinity, inside: false, lines: 0 }
      const style = getComputedStyle(body)
      const zoom = (body as HTMLElement & { currentCSSZoom: number }).currentCSSZoom
      const px = parseFloat(style.fontSize) * zoom
      const line = (style.lineHeight === 'normal' ? 1.2 * parseFloat(style.fontSize) : parseFloat(style.lineHeight)) * zoom
      const c = crop.querySelector('.byd-theme-crop')!.getBoundingClientRect()
      const b = body.getBoundingClientRect()
      return {
        found: true,
        px,
        // The crop is centred on the prose box (L43), not on the card.
        centredBy: Math.abs(c.left + c.width / 2 - (b.left + b.width / 2)),
        // And the box's sides stand inside the crop, so no line is cut at its ends.
        inside: b.left >= c.left - 0.5 && b.right <= c.right + 0.5,
        // How many of the box's lines the crop shows from its top.
        lines: (c.bottom - b.top) / line,
      }
    }),
  )
}

test.describe('the theme proof sets the body text in a size it can be read at (#741)', () => {
  for (const { width, height, floorPx } of WIDTHS) {
    for (const [deck, doc] of Object.entries(DECKS)) {
      test(`body text reaches ${floorPx} px on every tile at ${width}, centred on the prose box, with the ${deck} template`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await openTheme(page, doc())
        await showFaces(page)
        const seen = await proofs(page)
        expect(seen).toHaveLength(4)
        for (const tile of seen) {
          expect(tile.found).toBe(true)
          expect(tile.px).toBeGreaterThanOrEqual(floorPx - 0.05)
          expect(tile.centredBy).toBeLessThanOrEqual(1)
          expect(tile.inside).toBe(true)
          // The first three lines, and the fourth only fading.
          expect(tile.lines).toBeGreaterThanOrEqual(3)
          expect(tile.lines).toBeLessThan(4.5)
        }
      }, 60_000)
    }
  }

  // The crop is lower than the whole card was, so Speltema still fits the desk's window: the
  // gallery and the three folded parts, without the tab scrolling.
  test('Speltema does not scroll at 1280 × 800 once the faces are shown', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await openTheme(page, DECKS.spelkort())
    await showFaces(page)
    const work = await page.locator('.byd-theme-work').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
    expect(work.scroll).toBeLessThanOrEqual(work.client)
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBeLessThanOrEqual(0)
  }, 60_000)
})

// Found during #740: with the typeface catalog open beside it at 1024, four tiles in a row are
// narrower than what a tile draws, so they spilled over one another and the icons were cut.
test.describe('the gallery beside the catalog sheet at 1024 × 768 (#741, found in #740)', () => {
  for (const lang of ['sv', 'en'] as const) {
    test(`tiles never overlap and every icon is whole, before and after the faces are shown, in ${lang}`, async ({ page }) => {
      await page.setViewportSize({ width: 1024, height: 768 })
      await openTheme(page, DECKS.spelkort(), lang)
      await page.locator('[data-theme-section="fonts"] h2 button').click()
      await page.locator('.byd-fonts-catalog').click()
      await expect(page.locator('.byd-theme[data-sheet="catalog"]')).toHaveCount(1)
      const measure = () =>
        page.locator('.byd-theme-tile').evaluateAll((tiles) => {
          const boxes = tiles.map((t) => t.getBoundingClientRect())
          const overlaps: string[] = []
          boxes.forEach((a, i) =>
            boxes.forEach((b, j) => {
              if (j <= i) return
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps.push(`${i}×${j}`)
            }),
          )
          // A tile's content stays within its own edge, and every icon within the paper it stands on.
          const spills = tiles.flatMap((t, i) => (t.scrollWidth > t.clientWidth + 0.5 ? [`tile ${i} spills ${t.scrollWidth - t.clientWidth}px`] : []))
          const cut = tiles.flatMap((t, i) => {
            const paper = t.querySelector('.byd-theme-tile-paper')!.getBoundingClientRect()
            return [...t.querySelectorAll('.byd-theme-tile-paper img')].flatMap((img, k) => {
              const r = img.getBoundingClientRect()
              return r.left >= paper.left - 0.5 && r.right <= paper.right + 0.5 && r.width > 0 ? [] : [`tile ${i} icon ${k}`]
            })
          })
          return { overlaps, spills, cut, n: tiles.length }
        })
      expect(await measure()).toEqual({ overlaps: [], spills: [], cut: [], n: 4 })
      await showFaces(page)
      expect(await measure()).toEqual({ overlaps: [], spills: [], cut: [], n: 4 })
    }, 60_000)
  }
})

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
// And without the empty paper between them (#830, beställarens val C 2026-10-04): where the
// gap between the title band and the prose is 3 mm or more it is cut away, one paper with a thin
// dashed line where the cut is, and the prose's piece is as tall as the prose has lines — up to
// three, with a fourth fading only when there are more.
//
// Measured as relations and never as Mac pixels (CI sets the words in DejaVu): the body text's
// computed size times the zoom it is drawn at, against the floor the decision names for each
// width; the crop against the prose box it is centred on; lines against the line height they are
// set in; tiles against each other.

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
// so the crop is found from the template and not from millimetres that suit one of them. The
// sample's prose stands right under its title band, so it is never cut; the plain one's stands
// 30 mm down, and is. The plain one is also given a first card with more prose than three lines,
// which is the one that fades.
const LONG = 'Välj två andra spelare. De blandar en shot till varandra och dricker den samtidigt, och den som blir klar sist drar ett kort till och lägger det framför sig utan att titta på det.'
const DECKS = {
  spelkort: () => spelkortDoc(4) as unknown as ProjectDoc,
  plain: () => gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc,
  long: () => {
    const doc = gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc
    doc.rows[0]!.fields['body'] = LONG
    return doc
  },
} as const
const CUT: Record<keyof typeof DECKS, boolean> = { spelkort: false, plain: true, long: true }

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
  // The prose's piece follows its counted lines, which are counted once the card is fitted.
  await expect(page.locator('.byd-theme-tile [data-theme-card][data-lines]')).toHaveCount(4)
}

// What each tile's crop shows of the body text: the size the reader sees, where the prose box
// stands in the crop, how many lines the prose is set in and how many the crop shows, whether it
// fades, whether it is cut and how much of it is empty paper.
async function proofs(page: Page) {
  return page.locator('.byd-theme-tile [data-theme-card]').evaluateAll((cards) =>
    cards.map((card) => {
      const id = (card as HTMLElement).dataset['prose'] ?? ''
      const crop = card.querySelector<HTMLElement>('.byd-theme-crop')!
      const piece = crop.querySelector<HTMLElement>('[data-theme-piece="body"]')!
      const body = piece.querySelector<HTMLElement>(`[data-element="${CSS.escape(id)}"]`)
      if (!body) return { found: false, px: 0, centredBy: Infinity, inside: false, set: 0, shown: 0, fades: false, cuts: 0, gapLines: Infinity, empty: 1, cropPx: 0 }
      const style = getComputedStyle(body)
      const zoom = (body as HTMLElement & { currentCSSZoom: number }).currentCSSZoom
      const px = parseFloat(style.fontSize) * zoom
      const line = (style.lineHeight === 'normal' ? 1.2 * parseFloat(style.fontSize) : parseFloat(style.lineHeight)) * zoom
      // The rendered words' line fragments, one rect per line and text run — not the range's own
      // rects, which also hold each paragraph's whole box.
      const rectsOf = (el: Element) => {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        const out: DOMRect[] = []
        for (let node = walk.nextNode(); node; node = walk.nextNode()) {
          const range = document.createRange()
          range.selectNodeContents(node)
          out.push(...range.getClientRects())
        }
        return out.filter((r) => r.width > 0 && r.height > 0)
      }
      const lineTops = (el: Element) => {
        const tops: { top: number; bottom: number }[] = []
        for (const r of rectsOf(el).sort((a, b) => a.top - b.top)) {
          const last = tops[tops.length - 1]
          if (last && r.top < last.top + (last.bottom - last.top) / 2) last.bottom = Math.max(last.bottom, r.bottom)
          else tops.push({ top: r.top, bottom: r.bottom })
        }
        return tops
      }
      const c = crop.getBoundingClientRect()
      const p = piece.getBoundingClientRect()
      const b = body.getBoundingClientRect()
      // Where the gap was: from the title's line in the band to the prose's first line.
      const band = crop.querySelector('[data-theme-piece="band"]')
      const title = band?.querySelector('[data-element="title"]')
      const titleLine = title ? lineTops(title)[0] : undefined
      const firstLine = lineTops(body)[0]
      const gapLines = titleLine && firstLine ? (firstLine.top - titleLine.bottom) / line : Infinity
      // Empty paper, measured as the prototype measured it: the share of the crop's height that no
      // text line reaches, piece by piece, within what each piece shows. (The prototype counted a
      // filled band too; the plain template, the one that is cut, has none.)
      let covered = 0
      for (const shown of crop.querySelectorAll('[data-theme-piece]')) {
        const s = shown.getBoundingClientRect()
        const spans = [...shown.querySelectorAll('[data-element][data-fit]')]
          .flatMap((el) => rectsOf(el).map((r) => [r.top, r.bottom] as const))
          .map(([top, bottom]) => [Math.max(top, s.top), Math.min(bottom, s.bottom)] as const)
          .filter(([top, bottom]) => bottom > top)
          .sort((x, y) => x[0] - y[0])
        let end = -Infinity
        for (const [top, bottom] of spans) {
          if (bottom <= end) continue
          covered += bottom - Math.max(top, end)
          end = bottom
        }
      }
      return {
        found: true,
        px,
        // The crop is centred on the prose box (L43), not on the card.
        centredBy: Math.abs(c.left + c.width / 2 - (b.left + b.width / 2)),
        // And the box's sides stand inside the crop, so no line is cut at its ends.
        inside: b.left >= c.left - 0.5 && b.right <= c.right + 0.5,
        // How many lines the prose is set in, and how many of them the crop shows from the box's top.
        set: lineTops(body).length,
        shown: (p.bottom - b.top) / line,
        fades: getComputedStyle(crop).maskImage !== 'none',
        cuts: crop.querySelectorAll('.byd-theme-cut').length,
        gapLines,
        empty: 1 - covered / c.height,
        cropPx: c.height,
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
        }
      })
    }
  }

  // Speltema still fits the desk's window once the faces are shown: the gallery and the three
  // folded parts, without the tab scrolling.
  for (const deck of ['spelkort', 'plain', 'long'] as const) {
    test(`Speltema does not scroll at 1280 × 800 once the faces are shown, with the ${deck} template`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      await openTheme(page, DECKS[deck]())
      await showFaces(page)
      const work = await page.locator('.byd-theme-work').evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
      expect(work.scroll).toBeLessThanOrEqual(work.client)
      expect(await page.evaluate(() => document.scrollingElement!.scrollHeight - innerHeight)).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('the theme proof shows no empty paper between the title band and the prose (#830)', () => {
  for (const { width, height } of WIDTHS) {
    for (const deck of ['spelkort', 'plain', 'long'] as const) {
      test(`the crop is cut where the gap is, and is as tall as the prose has lines, with the ${deck} template at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await openTheme(page, DECKS[deck]())
        await showFaces(page)
        const seen = await proofs(page)
        expect(seen).toHaveLength(4)
        for (const tile of seen) {
          // A cut, and a dashed line where it is, only where there was a gap to cut.
          expect(tile.cuts).toBe(CUT[deck] ? 1 : 0)
          if (CUT[deck]) {
            // The title's line and the prose's first line now stand less than a line and a half apart,
            // where the plain template's 30 mm put four and more lines of paper between them.
            expect(tile.gapLines).toBeLessThan(1.5)
            // And the crop is mostly text: the uncut crop was four parts in five empty paper.
            expect(tile.empty).toBeLessThan(0.65)
          }
          // As tall as the prose has lines, up to three, and a fourth fading only when there are more.
          expect(tile.set).toBeGreaterThan(0)
          if (tile.set > 3) {
            expect(tile.fades).toBe(true)
            expect(tile.shown).toBeGreaterThan(3.9)
            expect(tile.shown).toBeLessThan(4.1)
          } else {
            expect(tile.fades).toBe(false)
            expect(tile.shown).toBeGreaterThanOrEqual(tile.set + 0.5)
            expect(tile.shown).toBeLessThan(tile.set + 1)
          }
        }
        // The plain template's card says one line, the long one more than three; the sample's two.
        const sets = seen.map((s) => s.set)
        if (deck === 'plain') expect(sets).toEqual([1, 1, 1, 1])
        if (deck === 'long') for (const n of sets) expect(n).toBeGreaterThan(3)
      })
    }
  }
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
    })
  }
})

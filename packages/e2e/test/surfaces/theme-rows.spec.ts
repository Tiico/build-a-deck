import { expect, test, type Page } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// Speltema's rows as a designer reads them (#740), at the two desk widths L12 binds and in both
// languages. Measured as relations — a struck line, a clipped value without its ellipsis, rows of
// one width — and never as pixels, because CI sets the same words in another face (DejaVu).

const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const SHEET = (family: string) => `/* latin */
@font-face { font-family: '${family}'; font-weight: 200 700; src: url(https://fonts.gstatic.com/s/x/latin.woff2) format('woff2'); }
`
const WOFF2 = Buffer.from([119, 79, 70, 50, 0, 1, 0, 0])

const WIDTHS = [
  [1280, 800],
  [1024, 768],
] as const

const WORDS = {
  'sv-SE': { fonts: /^Typsnitt/, open: /sök i google fonts/i, add: /^lägg till oswald$/i, icons: /^Spelets ikoner/ },
  'en-GB': { fonts: /^Fonts/, open: /search google fonts/i, add: /^add oswald$/i, icons: /^The game’s icons/ },
} as const

// A dark symbol as the set draws one; the look is not the question, the row around it is.
const ICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>')}`

const openTheme = async (page: Page, doc: ProjectDoc) => {
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-theme').click()
}

for (const [locale, words] of Object.entries(WORDS)) {
  test.describe(`Speltema in ${locale}`, () => {
    test.use({ locale })

    for (const [width, height] of WIDTHS) {
      // A catalog family arrives knowing its licence and its creator (L27): the answer is settled,
      // shown quiet and closed — never struck through, which reads as a licence withdrawn under a
      // heading that says it goes to the printer. And the creator is read whole, or cut with an
      // ellipsis and the whole of it under the pointer.
      test(`a catalog family's licence is never struck and its creator is never cut silently at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        await page.route(GOOGLE, (route) =>
          route.request().url().includes('googleapis.com')
            ? route.fulfill({ status: 200, contentType: 'text/css', body: SHEET('Oswald') })
            : route.fulfill({ status: 200, contentType: 'font/woff2', body: WOFF2 }),
        )
        await openTheme(page, gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc)
        await page.getByRole('button', { name: words.fonts }).click()
        await page.getByRole('button', { name: words.open }).click()
        await page.getByRole('searchbox', { name: words.open }).fill('oswald')
        await page.getByRole('button', { name: words.add }).click()
        const row = page.locator('li[data-font="Oswald"]')
        await expect(row.locator('.byd-fonts-licence[data-settled="true"] input')).toHaveCount(2)
        await expect(row.locator('.byd-fonts-licence input').last()).toHaveValue('Vernon Adams, Kalapi Gajjar, Cyreal')

        const fields = await row.locator('.byd-fonts-licence input').evaluateAll((inputs) =>
          inputs.map((el) => {
            const input = el as HTMLInputElement
            const style = getComputedStyle(input)
            // An input's scrollWidth does not grow with its value in Chromium, so the value is set
            // in the field's own font and held against the room inside its padding.
            const pen = document.createElement('canvas').getContext('2d')!
            pen.font = style.font
            const room = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
            const cut = pen.measureText(input.value).width > room
            return {
              value: input.value,
              struck: style.textDecorationLine.includes('line-through'),
              // Cut is allowed only when it says so: an ellipsis on the field, and the whole value
              // in its title.
              cutSilently: cut && !(style.textOverflow === 'ellipsis' && input.title === input.value),
            }
          }),
        )
        expect(fields).toEqual([
          { value: 'OFL 1.1', struck: false, cutSilently: false },
          { value: 'Vernon Adams, Kalapi Gajjar, Cyreal', struck: false, cutSilently: false },
        ])
      })

      // The game's icons are rows of one width with the name in a column of its own, as the
      // meanings above them are: a set whose edge follows the length of each name reads as a heap
      // and not as a list (#740).
      test(`the game's icons are rows of one width, with their names in one column, at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height })
        const doc = gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc
        doc.icons = { mynt: ICON, sköld: ICON, ö: ICON, 'en-mycket-lång-ikon': ICON }
        doc.credits = { mynt: { licence: 'CC0', by: 'build-your-deck' } }
        await openTheme(page, doc)
        await page.getByRole('button', { name: words.icons }).click()
        const rows = await page.locator('.byd-symbols-set li').evaluateAll((lis) =>
          lis.map((li) => {
            const box = li.getBoundingClientRect()
            const field = li.querySelector('input')!.getBoundingClientRect()
            return { left: Math.round(box.left), width: Math.round(box.width), field: Math.round(field.left) }
          }),
        )
        expect(rows).toHaveLength(4)
        // Non-vacuous: the names differ in length by a dozen letters, which is what spread the edge.
        expect(new Set(rows.map((r) => r.width)).size).toBe(1)
        expect(new Set(rows.map((r) => r.left)).size).toBe(1)
        expect(new Set(rows.map((r) => r.field)).size).toBe(1)
      })
    }
  })
}

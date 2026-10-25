import type { Page } from '@playwright/test'
import { twoEditors } from '../support/editors.js'
import { expect, test } from '../support/test.js'

// Ada works in her game when Bo opens it too (D3). The people in her header were faces, a count and
// «Dela» in one button, and Bo coming in widened it by some 70 px: the game's name gave way and every
// tab slid 60–90 px under her pointer at 1280, and at 1440 in CI's face, so a press on «Mall»
// released over «Tabell» and nothing was chosen (#1231, #1250). The door is now her own face and
// «Dela», and Bo hangs from the header's lower edge under it (L63, variant B). Measured with two
// real editors, each signed in as themselves, in the face CI draws with: Verdana is as wide as
// DejaVu, and on the Mac's narrow face the row had room to spare at 1440.
const WIDE = ".byd-editor, .byd-editor * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

// Everything before «Dela», and the door itself, by where it stands.
const row = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.byd-editor > header')!
    const pieces = [...header.querySelectorAll(':scope > .byd-editor-home, :scope > .byd-editor-name, :scope > .byd-editor-more, :scope > .byd-editor-rev, :scope > .byd-editor-saved, :scope > .byd-editor-steps, [role=tab], :scope > .byd-editor-here')]
    return pieces.map((el) => {
      const b = el.getBoundingClientRect()
      return `${el.className || el.textContent}: ${b.left}–${b.right}`
    })
  })

for (const width of [1280, 1440]) {
  test.describe(`the editor's header at ${width}`, () => {
    test.use({ viewport: { width, height: 900 }, locale: 'sv-SE' })

    test('stands still when a co-editor comes in, and hangs him from its edge (#1250)', async ({ browser, baseURL, page }) => {
      const game = await twoEditors(browser, baseURL, page)
      try {
        await page.goto(game.editorUrl)
        await page.addStyleTag({ content: WIDE })
        const door = page.locator('.byd-editor > header > [data-here]')
        await expect(door).toHaveAccessibleName('Dela · vilka som har spelet')
        await expect(door.locator('> i')).toHaveCount(1)
        await expect(door.locator('.byd-editor-here-others')).toHaveCount(0)
        const alone = await row(page)

        await game.bo.goto(game.editorUrl)
        await expect(door).toHaveAccessibleName('Dela: vilka som har spelet, 2 online')
        const bo = door.locator('.byd-editor-here-others i')
        await expect(bo).toHaveCount(1)
        expect(await row(page)).toEqual(alone)
        // Bo's face is drawn, over whatever stands under the header, with his name on the pointer.
        expect(await bo.evaluate((face) => {
          const b = face.getBoundingClientRect()
          return face.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2))
        })).toBe(true)
        await expect(bo).toHaveAttribute('title', (await game.bo.locator('[data-here] > i').getAttribute('title')) ?? '')

        // The stack is the door's: a press on it opens who has the game.
        await bo.click()
        await expect(page.getByRole('dialog', { name: 'Vilka som har spelet' })).toBeVisible()
        await page.keyboard.press('Escape')

        // Bo leaves, and the header is as it was before he came.
        await game.bo.close()
        await expect(door).toHaveAccessibleName('Dela · vilka som har spelet')
        await expect(door.locator('.byd-editor-here-others')).toHaveCount(0)
        expect(await row(page)).toEqual(alone)
      } finally {
        await game.close()
      }
    })
  })
}

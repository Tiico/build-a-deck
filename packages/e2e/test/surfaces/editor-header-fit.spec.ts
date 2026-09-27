import { expect, test } from '@playwright/test'
import { logIn, makeProject, startTable } from '../../support/api.js'

// With a table running, the header carries the most it ever carries: the game's name, the tabs,
// «Spara», «Uppdatera bordet» and the caret (#417); «Nytt bord» is in the caret's menu. At the desk's two widths the
// primary was cut to «Uppdatera bo» and a game called «Sal's Saloon» to «Sal's …» (#477, fynd 4).
// A button whose name is clipped is a button whose errand is guessed, and the name is the one
// thing on the page that says whose game this is. Both must be read whole.
//
// Measured in both languages the editor speaks, because the two are not the same length.
for (const locale of ['sv-SE', 'en-GB']) {
  for (const width of [1024, 1280]) {
    test.describe(`the header at ${width} in ${locale}`, () => {
      test.use({ viewport: { width, height: 800 }, locale })

      test('reads the primary, «Nytt bord» and the game’s name whole while a table runs', async ({ page }) => {
        await logIn(page.request)
        const project = await makeProject(page.request, { name: "Sal's Saloon", players: 4, cards: 8 })
        await startTable(page.request, project.id)
        await page.goto(project.editorUrl)
        const primary = page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')
        // The table is picked up from the server, so the header is measured once it has it.
        await expect(primary).toHaveAttribute('data-table-kind', 'running')

        const clipped = await page.evaluate(() => {
          const header = document.querySelector('.byd-editor > header')!
          const cut = (el: Element | null) => (el instanceof HTMLElement && el.scrollWidth > el.clientWidth ? `${el.clientWidth}/${el.scrollWidth}` : null)
          const buttons = [...header.querySelectorAll(':scope > button, :scope > .byd-editor-split > button')]
          const out: Record<string, string> = {}
          const name = cut(header.querySelector(':scope > strong'))
          if (name) out['name'] = name
          for (const b of buttons) {
            const c = cut(b)
            if (c) out[b.textContent?.trim() || b.getAttribute('aria-label') || '?'] = c
          }
          const across = document.documentElement.scrollWidth - document.documentElement.clientWidth
          if (across > 0) out['page'] = `${across}px across`
          return out
        })
        expect(clipped).toEqual({})

        // «Nytt bord» stands in the caret's menu at every width (beslut 2026-09-27, #477 fynd 4 B):
        // one place, one press away, above «Alla bord».
        await expect(page.locator('.byd-editor > header > .byd-editor-new-table')).toHaveCount(0)
        await page.locator('.byd-editor-caret').click()
        await expect(page.locator('.byd-editor-ways-new')).toBeVisible()
      })
    })
  }
}

// The strip under the header says good news in green, and its buttons wore the pink of a card that
// could not be rendered — «Ny kod» looked like a fault. The error colours are the lost and stalled
// states' own; the rest are the quiet outlined button, and every one is a full target (#477).
test.describe('the table strip under the header', () => {
  test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

  test('draws its buttons as quiet targets, and keeps the error colours for errors', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Remsan', players: 2, cards: 3 })
    await startTable(page.request, project.id)
    await page.goto(project.editorUrl)
    const code = page.locator('.byd-editor-table-link .byd-editor-room button')
    await expect(code).toBeVisible()
    const drawn = await code.evaluate((b) => {
      const s = getComputedStyle(b)
      return { height: Math.round(b.getBoundingClientRect().height), background: s.backgroundColor }
    })
    expect(drawn.height).toBeGreaterThanOrEqual(44)
    expect(drawn.background).toBe('rgba(0, 0, 0, 0)')
  })
})

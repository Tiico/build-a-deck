import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { logIn, makeProject, makeProjectOf, startTable } from '../../support/api.js'

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
        // Below 1440 the primary says its errand short, and still names it whole (#566, beslut
        // 2026-09-30): the step buttons took the room its last word stood in.
        await expect(primary).toHaveAccessibleName(locale === 'sv-SE' ? 'Uppdatera bordet' : 'Update the table')
        expect((await primary.innerText()).trim()).toBe(locale === 'sv-SE' ? 'Uppdatera' : 'Update')

        // «Nytt bord» stands in the caret's menu at every width (beslut 2026-09-27, #477 fynd 4 B):
        // one place, one press away, above «Alla bord».
        await expect(page.locator('.byd-editor > header > .byd-editor-new-table')).toHaveCount(0)
        await page.locator('.byd-editor-caret').click()
        await expect(page.locator('.byd-editor-ways-new')).toBeVisible()
      })
    })
  }
}

// The save status changes its word as the work goes from saved to unsaved and back (#8), and every
// control after it in the row stood where the word ended: at 1440 the tabs slid 12 px sideways in
// Swedish and 23 px in English each time (#668). A tab that moves under the pointer between two
// presses is a tab the second press misses. The status holds the room of its wider word, in the
// font this machine has, so the row after it is where it was in both states.
const tabsAt = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll('.byd-editor > header [role=tab]')].map((t) => t.getBoundingClientRect().left))

// Every control in the header and the game's name read whole, and the page not pushed sideways.
const headerCut = (page: Page) =>
  page.evaluate(() => {
    const header = document.querySelector('.byd-editor > header')!
    const cut = [...header.querySelectorAll<HTMLElement>(':scope > strong, :scope :is(button, a)')]
      .filter((el) => el.getClientRects().length > 0 && el.scrollWidth > el.clientWidth + 1)
      .map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim())
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth) cut.push('page')
    return cut
  })

for (const locale of ['sv-SE', 'en-GB']) {
  test.describe(`the tab row at 1440 in ${locale}`, () => {
    test.use({ viewport: { width: 1440, height: 800 }, locale })

    test('stands still while the work goes unsaved and back', async ({ page }) => {
      await logIn(page.request)
      const project = await makeProjectOf(page.request, spelkortDoc(4))
      await startTable(page.request, project.id)
      await page.goto(`${project.editorUrl}&lang=${locale.slice(0, 2)}`)
      await expect(page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')).toHaveAttribute('data-table-kind', 'running')
      const status = page.locator('.byd-editor > header > .byd-editor-saved')
      await expect(status).toHaveAttribute('data-unsaved', 'false')
      await page.locator('#byd-editor-tab-template').click()
      const saved = await tabsAt(page)

      await page.getByRole('button', { name: /^paper\b/ }).first().click()
      const x = page.locator('.byd-props-f input').first()
      await x.fill('-2')
      await x.press('Enter')
      await expect(status).toHaveAttribute('data-unsaved', 'true')
      expect(await tabsAt(page)).toEqual(saved)
      expect(await headerCut(page)).toEqual([])

      // Taken back, the work is the server's again (L9), and the word goes back to its own.
      await page.locator('.byd-editor-steps button').first().click()
      await expect(status).toHaveAttribute('data-unsaved', 'false')
      expect(await tabsAt(page)).toEqual(saved)
      expect(await headerCut(page)).toEqual([])
    })
  })
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

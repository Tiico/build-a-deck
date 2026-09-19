import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { logIn, makeProject, startTable } from '../../support/api.js'

// The Bord tab on one screen (#126). It was the one tab in the editor that did not fit: the setup
// and the list of running tables were two panels stacked, each asking for a whole work area, so
// the list began a screenful below the felt and the whole tab scrolled as one. The header, the
// revision, the tabs and **Uppdatera bordet** went with it.
//
// Whether a tab fits, and what scrolls when it does not, are layout questions, so they are asked
// of a real engine against the stylesheet the editor ships. The widths are the three the audit
// measured at, each with the height it was measured with; a tab that fits at 900 and not at 768
// fits nothing.
//
// Migrated from `packages/web/test/editor-tables-layout.test.tsx`. The document-level readings
// here are the reason it is worth the trip: `editor-window` found the live page scrolling a pixel
// that the lifted-markup form could not see, and the first test below asks that same question of
// this tab.
const SCREENS = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
] as const

const PANEL = 'byd-editor-panel-tables'

/** The Bord tab, open, with a table running on it. */
async function bordTab(page: Page): Promise<void> {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4, cards: 12 })
  // A table is running, because that is the state the tab is worth opening in — the list is one of
  // the two columns whose scrolling this is about.
  await startTable(page.request, project.id)
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-tables').click()
  // The list comes from the server, so the panel is a loading line until it arrives.
  await expect(page.locator('.byd-tables')).toBeVisible()
  await expect(page.locator('.byd-table-row, .byd-tables-fold').first()).toBeVisible()
}

for (const screen of SCREENS) {
  test.describe(`the Bord tab at ${screen.width} × ${screen.height}`, () => {
    test.use({ viewport: screen })

    test('holds the whole tab inside the window, so the editor stays where it was left', async ({ page }) => {
      await bordTab(page)
      const measured = await page.evaluate(() => {
        const doc = document.documentElement
        const main = document.querySelector('main')!
        return {
          // The page itself, which is what carries the header out of sight when it gives way.
          page: `${doc.scrollHeight - doc.clientHeight}/${doc.scrollWidth - doc.clientWidth}`,
          // And the work area under it: a tab that scrolls as one is the same fault one box in.
          work: `${main.scrollHeight - main.clientHeight}/${main.scrollWidth - main.clientWidth}`,
        }
      })
      expect(measured).toEqual({ page: '0/0', work: '0/0' })
    })

    test('gives each column its own scrolling, and puts none of it inside another', async ({ page }) => {
      await bordTab(page)
      const measured = await page.evaluate((panel) => {
        const root = document.querySelector<HTMLElement>(`#${panel} > *`)!
        // A box that really scrolls, not one that merely says it may: the tab had three boxes
        // declaring `overflow: auto` inside each other, and what a reader meets is the ones with
        // something to scroll.
        const scrolls = (el: HTMLElement) => /auto|scroll/.test(`${getComputedStyle(el).overflow}${getComputedStyle(el).overflowY}`) && el.scrollHeight - el.clientHeight > 1
        const scrolling = [...root.querySelectorAll<HTMLElement>('*')].filter(scrolls)
        // Which column each one is in. Two scrolling boxes in one column is a reader who has to
        // find out which of them her wheel is over before she can move.
        const column = (el: HTMLElement) => [...root.children].findIndex((c) => c.contains(el))
        const columns = scrolling.map(column)
        return {
          // Nothing scrolls inside something else that scrolls …
          nested: scrolling.filter((el) => scrolling.some((other) => other !== el && other.contains(el))).map((el) => el.className),
          // … nothing scrolls outside a column …
          loose: scrolling.filter((el) => column(el) < 0).map((el) => el.className),
          // … and no column holds two.
          twice: columns.filter((c, i) => columns.indexOf(c) !== i).map((c) => `column ${c}`),
        }
      }, PANEL)
      expect(measured).toEqual({ nested: [], loose: [], twice: [] })
    })

    test('puts the running tables on the first screen, not a screenful below it', async ({ page }) => {
      await bordTab(page)
      const measured = await page.evaluate(() => {
        const list = document.querySelector('.byd-tables')!.getBoundingClientRect()
        return { above: Math.round(list.top) < innerHeight, top: Math.round(list.top) }
      })
      expect(measured.above, `the list of running tables starts at y = ${measured.top}`).toBe(true)
    })
  })
}

// The last of #126's criteria is not a measurement but a habit: a height worked out from a number
// somebody wrote down for how tall the chrome is. `.byd-setup-side` guessed 116 px where the
// header takes 57, and a guess like that is wrong in every window it was not written in.
//
// A question about the source, so it is asked of the file and no browser is opened for it.
const editorCss = readFileSync(join(import.meta.dirname, '..', '..', '..', 'web', 'src', 'editor', 'editor.css'), 'utf8')

test.describe('the height the Bord tab works with', () => {
  test('comes out of the layout and not out of a guess about the chrome', () => {
    // The comments are cut away first: this file's own reason for the rule names the guess it
    // replaced, and a guard that cannot tell a rule from the sentence explaining it would fail on
    // the explanation.
    const rules = editorCss.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    expect([...rules.matchAll(/[^;{}]*calc\(\s*100[dls]*vh\s*-[^;}]*/g)].map((m) => m[0].trim())).toEqual([])
  })

  test('is found at all, so this guard cannot pass by reading an empty file', () => {
    expect(editorCss).toContain('.byd-setup {')
  })
})

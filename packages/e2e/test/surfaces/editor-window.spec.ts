import { expect, test } from '@playwright/test'
import { logIn, makeProject, startTable } from '../../support/api.js'

// The editor is an application on the web: the window itself never scrolls (UX-KONTROLLER, L12).
//
// `editor-tables-layout` holds the Bord tab's own boxes inside the window and `editor-viewport`
// holds the page to not scrolling sideways. Neither asks the other question — whether the
// *document* is taller than the window — and two boxes nobody can see were making it so:
//
//   `.byd-offscreen`, the line only a screen reader reads, is `position: absolute` with no `top`
//   or `left`. Such a box keeps its *static* position: wherever the flow would have put it, which
//   is the very end of the open tab. On Bord, while that tab was still two screens tall, it put a
//   1 px box at y = 1036, and `.byd-editor` grew to follow it even though `main` clipped
//   everything else — 137 px of window scroll, the header off the top of the screen and a blank
//   page under the app (#126). One screen later it still stood 7 px past a 768 px window.
//
//   `.byd-setup`'s single implicit row was `auto`, so the track took the tallest column's
//   max-content — the zone list, 738 px on a four-seat table — rather than the height the tab had.
//
// Measured at 1024 × 768, the shortest desk the editor is held to and the one both showed up at.
//
// Migrated from `packages/web/test/editor-window.test.tsx`, which rendered the editor into jsdom,
// clicked each tab, lifted the markup out of each and measured the six documents in Chromium. This
// clicks the tabs in the editor itself. That matters more here than in most of these: what is
// measured is the *document's* own scroll height, and a document assembled around lifted markup is
// only the same document if nothing outside `.byd-editor` ever contributed to it — which is
// precisely the assumption `.byd-offscreen` broke.
const DESK = { width: 1024, height: 768 }

test.use({ viewport: DESK })

test.describe(`the editor at ${DESK.width} × ${DESK.height}`, () => {
  test('never makes the window scroll, on any tab', async ({ page }) => {
    await logIn(page.request)
    // A deck and a table of the size someone actually works on: sixty cards, four seats, a counter
    // at each. A three-row, two-seat game is shorter than any window on every tab, so it could not
    // have caught either box.
    const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4, cards: 60, copies: 2, counters: [{ name: 'Guld', start: 0 }] })
    // A table is running, because that is the state Bord is worth opening in — and because the
    // list of tables is what makes the third column tall enough for the boxes to show up.
    await startTable(page.request, project.id)

    await page.goto(project.editorUrl)
    await expect(page.getByText('Skogens herrar').first()).toBeVisible()

    const tabs = page.locator('[role="tablist"] [role="tab"]')
    const count = await tabs.count()
    expect(count, 'the editor has tabs to walk, so this cannot pass by measuring nothing').toBeGreaterThan(4)

    const scrolled: Record<string, string[]> = {}
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i)
      // The mode, off the tab's own id, so nothing here depends on which language the editor is
      // read in (A4) — `Bord` and `Tables` are the same tab.
      const mode = ((await tab.getAttribute('id')) ?? '').replace('byd-editor-tab-', '')
      const name = mode || String(i)
      await tab.click()
      // The panel this tab controls has something in it.
      const panel = page.locator(`#${(await tab.getAttribute('aria-controls')) ?? ''}`)
      await expect(panel.locator('> *').first()).toBeVisible()
      // Bord alone has a part that arrives from the server. A table nobody has played is behind a
      // fold (#176), so what is waited for there is whichever of the two arrives — and only there,
      // because a wait that every tab pays is six waits for one tab's sake.
      if (mode === 'tables') await expect(page.locator('.byd-table-row, .byd-tables-fold').first()).toBeVisible()

      scrolled[name] = await page.evaluate(() => {
        const de = document.documentElement
        const down = de.scrollHeight - de.clientHeight
        const across = de.scrollWidth - de.clientWidth
        return [...(down > 0 ? [`${down}px down`] : []), ...(across > 0 ? [`${across}px across`] : [])]
      })
    }
    expect(scrolled).toEqual(Object.fromEntries(Object.keys(scrolled).map((name) => [name, []])))
  })
})

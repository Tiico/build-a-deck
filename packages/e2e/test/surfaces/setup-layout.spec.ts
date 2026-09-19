import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The table stands still while its zones are worked on (#218).
//
// `.byd-setup-canvas` is a flex column: the line of chrome, then the felt at `flex: 1 1 auto`, then
// — only when a pile is selected — the sentences that say what that pile starts with. So selecting
// a pile put a panel into the column under the felt, the felt gave up the room for it, and the
// whole table rescaled: «hela bordet hoppar runt». Every slot opened inside those sentences moved
// it again, because every one of them changes how tall they are.
//
// No pixel of it is written down: what is claimed is that a rectangle is the same rectangle before
// and after, which is true at any size and in any font.
//
// Migrated from `packages/web/test/setup-layout.test.tsx`. That version rendered the editor into
// jsdom twice — once with the pile shut and once with it opened — lifted the markup out of each,
// and measured the two in Chromium. This opens the editor once and clicks the pile, which is what
// #218 actually is: not two documents that differ, but one document that moves under someone's
// hands. The old shape could only ever have caught a table that was laid out differently; this
// catches a table that *jumps*, which is the complaint.
const EDITOR_IS_DESKTOP = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
] as const

const feltBox = (page: Page) =>
  page.evaluate(() => {
    const felt = document.querySelector<HTMLElement>('.byd-setup-felt')
    if (!felt) throw new Error('no felt in this view')
    const r = felt.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
  })

for (const viewport of EDITOR_IS_DESKTOP) {
  test.describe(`the felt while a pile’s rules are opened (#218), at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport })

    test('is the same rectangle before and after', async ({ page }) => {
      await logIn(page.request)
      const project = await makeProject(page.request, { name: 'Skogens herrar', players: 4 })
      await page.goto(project.editorUrl)
      await expect(page.getByText('Skogens herrar').first()).toBeVisible()

      // The Bord tab, where a table's zones are laid out. Its mode is `tables` and not `table` —
      // `table` is Tabell, the data. `EditorPage` mounts `SetupEditor` under `tables`.
      await page.locator('#byd-editor-tab-tables').click()
      await expect(page.locator('[data-setup-editor]')).toBeVisible()
      const shut = await feltBox(page)

      // A pile opened for its rules — the panel that used to take the felt's room with it.
      await page.locator('[data-zone-row="draw"] button').first().click()
      await expect(page.locator('[data-zone-actions]')).toBeVisible()
      const open = await feltBox(page)

      expect(open).toEqual(shut)
    })
  })
}

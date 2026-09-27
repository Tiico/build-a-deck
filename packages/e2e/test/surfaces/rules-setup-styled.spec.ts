import { expect, test } from '@playwright/test'
import type { ProjectDoc } from '../../../web/src/editor/types.js'
import { logIn, makeProjectOf } from '../../support/api.js'
import { gameDoc } from '../../support/game.js'

// The setup in the Regler tab (#481, fynd 3). Its buttons are drawn by `rules/rules.css`, which
// since #346 travels with the drawer at the table and nothing else — so in the editor they stood
// in the browser's own Arial and outset border until «Som på bordet» had been opened once and had
// fetched the sheet. The same block has to look the same whichever mode was opened first.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('draws the setup block in the book’s own style before the table mode has ever been opened', async ({ page }) => {
  const doc = gameDoc({ name: 'Skogens herrar', cards: 4 }) as unknown as ProjectDoc
  doc.rules = { title: 'Skogens herrar', blocks: [{ kind: 'heading', id: 'h1', level: 1, text: 'Så spelar ni' }, { kind: 'setup', id: 's1', caption: 'Så ställs bordet upp' }] }
  await logIn(page.request)
  const project = await makeProjectOf(page.request, doc)
  await page.goto(project.editorUrl)
  await page.locator('#byd-editor-tab-rules').click()
  const toggle = page.locator('[data-rulebook] .byd-rules-setup-toggle')
  await expect(toggle).toBeVisible()
  const drawn = await toggle.evaluate((el) => {
    const how = getComputedStyle(el)
    return { border: how.borderTopStyle, font: how.fontFamily.includes('Arial') }
  })
  expect(drawn).toEqual({ border: 'solid', font: false })
})

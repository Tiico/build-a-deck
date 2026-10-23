import type { APIRequestContext, Page } from '@playwright/test'
import type { RuleDoc } from '@byd/server'
import { DESK } from '../support/devices.js'
import { openTogether, twoEditors } from '../support/editors.js'
import { expect, test } from '../support/test.js'

// Two editors in the same rulebook (#1053, D3, B7). Ada owns the game and Bo edits it with her, each
// in a browser of their own, signed in as themselves. Ada writes in the first paragraph and Bo in the
// second. The tab wrote the whole book on every keystroke (`setRules`), so whichever edit landed last
// carried the book as its writer had last seen it, and the other's paragraph went back to what it was
// — with no conflict shown, on both screens and in the version saved. Every edit the tab makes now
// names the blocks it changes and no others.
//
// Bo's line is what makes the order certain. Ada's paragraph has reached the actor before Bo writes,
// but not Bo: his book is the one from before her edit, which is what a slow line or a train tunnel
// gives a co-editor in earnest.
test.use({ viewport: DESK.viewport, locale: 'sv-SE' })

const ADA = 'Ada skrev det här.'
const BO = 'Bo skrev det här.'

// Båda öppnar spelet, och när båda huvudena har satt sig (#1231) öppnar var och en boken.
async function openBooks(ada: Page, bo: Page, url: string): Promise<void> {
  await openTogether(ada, bo, url)
  for (const page of [ada, bo]) {
    await page.getByRole('tab', { name: 'Regler' }).click()
    await expect(page.locator('[data-rulebook]')).toContainText('Andra stycket.')
  }
}

// A paragraph written over, the way a designer does it: opened where it stands, and closed again.
async function write(page: Page, was: string, now: string): Promise<void> {
  const book = page.locator('[data-rulebook]')
  await book.getByText(was).click()
  const field = book.getByRole('textbox', { name: /^Text/ })
  await expect(field).toBeFocused()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type(now)
  await page.keyboard.press('Escape')
  await expect(field).toHaveCount(0)
}

const paragraphs = (page: Page) => page.locator('[data-rulebook] [data-block^="t"] p')

// The version saved from Ada's editor, read back from the store.
async function stored(page: Page, request: APIRequestContext, id: string): Promise<string[]> {
  await page.locator('.byd-editor-save').click()
  await expect(page.locator('.byd-editor-saved-word')).toHaveText('Sparat')
  const res = await request.get(`/projects/${encodeURIComponent(id)}`)
  const rec = (await res.json()) as { rules: RuleDoc }
  return rec.rules.blocks.flatMap((b) => (b.kind === 'text' ? [b.text] : []))
}

test('a co-editor writing in one paragraph keeps what the other wrote in the next (#1053)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await openBooks(page, game.bo, game.editorUrl)

    // Bo's line is slow: what the actor says reaches him late.
    game.line.hold()
    await write(page, 'Första stycket.', ADA)
    // Ada's paragraph has landed with the actor, which tells Bo — and the telling is on its way.
    await expect.poll(() => game.line.held().some((frame) => frame.includes(ADA))).toBe(true)
    await expect(paragraphs(game.bo)).toHaveText(['Första stycket.', 'Andra stycket.'])

    await write(game.bo, 'Andra stycket.', BO)
    // Bo's paragraph reaches Ada, and hers is still there.
    await expect(paragraphs(page)).toHaveText([ADA, BO])

    game.line.release()
    await expect(paragraphs(game.bo)).toHaveText([ADA, BO])
    await expect(paragraphs(page)).toHaveText([ADA, BO])
    expect(await stored(page, page.request, game.id)).toEqual([ADA, BO])
  } finally {
    await game.close()
  }
})

test('an edit written while the line was down lands on the book as it is now, not as it was (#1053)', async ({ browser, baseURL, page }) => {
  const game = await twoEditors(browser, baseURL, page)
  try {
    await openBooks(page, game.bo, game.editorUrl)

    // Bo goes into a tunnel, and his editor says so.
    await game.line.cut()
    await expect(game.bo.locator('.byd-editor-offline[data-offline]')).toBeVisible({ timeout: 30_000 })

    await write(page, 'Första stycket.', ADA)
    // Bo writes on the book he has, which is the one from before Ada's paragraph.
    await write(game.bo, 'Andra stycket.', BO)
    await expect(paragraphs(game.bo)).toHaveText(['Första stycket.', BO])

    // The line comes back, and what he wrote in the dark is sent.
    game.line.restore()
    await expect(game.bo.locator('.byd-editor-offline[data-offline]')).toHaveCount(0, { timeout: 30_000 })
    await expect(paragraphs(page)).toHaveText([ADA, BO])
    await expect(paragraphs(game.bo)).toHaveText([ADA, BO])
    expect(await stored(page, page.request, game.id)).toEqual([ADA, BO])
  } finally {
    await game.close()
  }
})

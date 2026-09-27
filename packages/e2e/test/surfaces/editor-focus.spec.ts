import { expect, test, type Page } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The focus never falls to <body> on the editor's frame and wall (#477, fynd 6). A button that
// disables itself while it has the focus, and a press that takes away the thing that was pressed,
// both hand the focus to the document — and the next Tab starts over from the top of the page.
// Measured with real presses, because focus fixup is the browser's and jsdom does none of it.
test.use({ viewport: { width: 1280, height: 800 } })

const lost = (page: Page) => page.evaluate(() => document.activeElement === document.body || document.activeElement === null)

test.describe('the focus on the editor frame (#477)', () => {
  test('stays on the primary while it starts a table', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Fokusbordet', players: 2, cards: 3 })
    await page.goto(project.editorUrl)
    const primary = page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')
    await expect(primary).toHaveAttribute('data-table-kind', 'none')
    await primary.focus()
    await page.keyboard.press('Enter')
    await expect(primary).toHaveAttribute('data-table-kind', 'new')
    expect(await lost(page)).toBe(false)
    await expect(primary).toBeFocused()
  })

  test('lands on the comparison when a version is compared', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Fokusjämförelse', players: 2, cards: 3 })
    const doc = (await (await page.request.get(`/projects/${project.id}`)).json()) as Record<string, unknown> & { rev: number; name: string }
    expect((await page.request.put(`/projects/${project.id}`, { data: { ...doc, name: 'Fokusjämförelse 2' } })).ok()).toBe(true)
    await page.goto(project.editorUrl)
    await page.locator('.byd-editor-rev').click()
    await page.locator('.byd-history li[data-rev="1"] > button').click()
    await page.locator('.byd-history li[data-rev="1"] .byd-history-detail button').first().click()
    await expect(page.locator('.byd-data-compare')).toBeVisible()
    expect(await lost(page)).toBe(false)
    await expect(page.locator('.byd-data-compare')).toContainText(await page.evaluate(() => document.activeElement?.textContent ?? ''))
  })

  test('goes with the element when one is chosen on a card on the wall', async ({ page }) => {
    await logIn(page.request)
    const project = await makeProject(page.request, { name: 'Fokusväggen', players: 2, cards: 3 })
    await page.goto(project.editorUrl)
    await page.locator('[data-card-ref] [data-element="title"]').first().click()
    await expect(page.locator('#byd-editor-tab-template')).toHaveAttribute('aria-selected', 'true')
    expect(await lost(page)).toBe(false)
    await expect(page.locator('[data-layer="title"] .byd-layer-pick')).toBeFocused()
  })
})

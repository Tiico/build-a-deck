import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// A new card where it can be seen (#479): with 77 cards «+ Nytt kort» put the row 3 000 px below a
// table that stayed at its top, with the focus left on the button. The row is now in view and the
// caret stands in its first cell to write in.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('scrolls the new card into view and puts the caret in it', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 77 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await page.getByRole('button', { name: '+ Nytt kort' }).click()
  const row = page.locator('tr[data-card-ref="kort-78"]')
  await expect(row).toBeInViewport()
  await expect(row.locator('.byd-data-lane input').first()).toBeFocused()
})

import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The import asks before it removes cards (#479). The question is a sentence, and the import box
// sets its sentences after its pair of controls (#36): written into the middle of the row, it
// stood between «Importera CSV…» and «Ladda ner CSV» and stretched both to its own height.
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

test('asks under the import pair rather than between it', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 6 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await page.getByRole('button', { name: 'Importera' }).click()
  const pick = page.locator('.byd-data-tools label')
  const save = page.locator('.byd-data-tools a')
  const before = { pick: await pick.boundingBox(), save: await save.boundingBox() }
  await page.getByLabel('Importera CSV…').setInputFiles({ name: 'kort.csv', mimeType: 'text/csv', buffer: Buffer.from('id,title\nkort-1,Björn\n') })
  const question = page.getByRole('alertdialog')
  await expect(question).toBeVisible()
  const asked = await question.boundingBox()
  const after = { pick: await pick.boundingBox(), save: await save.boundingBox() }
  // The pair stands where it stood, as tall as it was, on one line with each other.
  expect(after).toEqual(before)
  expect(asked!.y).toBeGreaterThanOrEqual(after.pick!.y + after.pick!.height)
})

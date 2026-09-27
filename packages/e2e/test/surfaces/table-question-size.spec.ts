import { expect, test } from '@playwright/test'
import { logIn, makeProject } from '../../support/api.js'

// The table's own strips (#479): the bulk row under a marking and the question before cards go
// drew 32 px buttons, under the 44 every other control in the editor has (L12, UX-KONTROLLER).
test.use({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE' })

const small = (page: import('@playwright/test').Page, within: string) =>
  page.$$eval(`${within} button`, (els) =>
    els
      .filter((el) => el.checkVisibility())
      .map((el) => ({ what: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30), h: Math.round(el.getBoundingClientRect().height) }))
      .filter(({ h }) => h < 44),
  )

test('gives the bulk row and its question 44 px buttons', async ({ page }) => {
  await logIn(page.request)
  const project = await makeProject(page.request, { name: 'Skogens herrar', cards: 6 })
  await page.goto(project.editorUrl)
  await expect(page.getByText('Skogens herrar').first()).toBeVisible()
  await page.locator('#byd-editor-tab-table').click()
  await page.getByLabel('Markera alla synliga').check()
  await expect(page.locator('.byd-data-bulk')).toBeVisible()
  expect(await small(page, '.byd-data-bulk')).toEqual([])
  await page.locator('.byd-data-bulk button[data-kind="danger"]').click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  expect(await small(page, '[role="alertdialog"]')).toEqual([])
})

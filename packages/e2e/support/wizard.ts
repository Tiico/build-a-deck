import type { Page } from '@playwright/test'

// The guide stands behind the first door of the crossroads at `/new` (L79, #1218): a name, then
// «Guidad start», and the guide is at its own address.
export async function throughTheDoor(page: Page, name = 'Skogens herrar'): Promise<void> {
  await page.getByLabel('Spelets namn').fill(name)
  await page.getByRole('button', { name: 'Guidad start' }).click()
  await page.waitForURL(/\/new\/guided/)
}

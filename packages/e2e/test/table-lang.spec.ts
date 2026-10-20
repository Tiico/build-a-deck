import { TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// TV:n är värdens skärm och talar värdens språk (#756, beställarens beslut, A4). Editorns länk bär
// språket som `?lang=`, och TV:n minns det: speltestet öppnade TV:n med `?lang=sv`, och nästa
// navigering föll tillbaka på webbläsarens engelska. Webbläsaren här är engelsk (Playwrights
// standard), så att en svensk TV efter besöket utan `?lang=` bara kan komma ur minnet.
test('TV:n minns språket den öppnades på, också utan ?lang= nästa gång (#756)', async ({ tableOf, open }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
  const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv')
  await expect(page.getByText(/Inget hänt ännu/)).toBeVisible()

  await page.goto(table.tvUrl)
  await expect(page.locator('html')).toHaveAttribute('lang', 'sv')
  await expect(page.getByText(/Inget hänt ännu/)).toBeVisible()
})

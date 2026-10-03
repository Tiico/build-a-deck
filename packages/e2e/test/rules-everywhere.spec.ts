import { join, tableWithRules } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Regelboken når varje skärm vid bordet (B7, #709). TV:n och telefonen hade luckan; observatören
// (C8) och distansspelaren (C2) hade den inte, fast editorns hjälp lovar «telefonen, TV:n och
// observatören» — och en distansspelare vid en laptop har varken TV eller telefon.
test('the observer opens the rulebook from her own screen (#709)', async ({ request, open }) => {
  const table = await tableWithRules(request, { players: 2 })
  const eva = await join(request, table, { name: 'Eva' })
  const { page } = await open(DESK, `${eva.observeUrl}&lang=sv`)
  const rules = page.getByRole('button', { name: 'Regler', exact: true })
  await expect(rules).toBeVisible()
  await rules.click()
  await expect(page.locator('.byd-rules-panel').getByRole('heading', { name: 'Så spelar ni' })).toBeVisible()
})

test('a seat playing at a distance opens the rulebook beside the felt (#709)', async ({ request, open }) => {
  const table = await tableWithRules(request, { players: 2 })
  const ada = await join(request, table, { name: 'Ada', seat: table.seats[0]! })
  const { page } = await open({ name: 'laptop', viewport: { width: 1280, height: 800 } }, `${ada.onlineUrl}&lang=sv`)
  await expect(page.locator('.byd-online-felt')).toBeVisible()
  const rules = page.getByRole('button', { name: 'Regler', exact: true })
  await expect(rules).toBeVisible()
  await rules.click()
  await expect(page.locator('.byd-rules-panel').getByRole('heading', { name: 'Så spelar ni' })).toBeVisible()
})

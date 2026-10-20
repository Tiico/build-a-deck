import { join, tableWithRules } from '../support/api.js'
import type { Page } from '@playwright/test'
import { DESK, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Bokens titel är bokens egen: kolumnen bredvid filten sätter versaler, spärrning och en grå ton på
// sina rubriker och tar siffrorna av sina listor, och luckan hänger i den kolumnen på TV:n och hos observatören (#709).
const titleOf = (page: Page) =>
  page.locator('.byd-rules-panel h2').evaluate((h) => {
    const s = getComputedStyle(h)
    const ol = h.closest('.byd-rules-panel')!.querySelector('ol')!
    return { transform: s.textTransform, spacing: s.letterSpacing, size: s.fontSize, list: getComputedStyle(ol).listStyleType, item: getComputedStyle(ol.querySelector('li')!).display }
  })
// En numrerad lista i boken är numrerad också där kolumnens flöde är en lista utan siffror.
const BOOK_TITLE = { transform: 'none', spacing: 'normal', size: '20px', list: 'decimal', item: 'list-item' }

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
  expect(await titleOf(page)).toEqual(BOOK_TITLE)
})

test('the room’s television sets the book’s title in the book’s own type (#709)', async ({ request, open }) => {
  const table = await tableWithRules(request, { players: 2 })
  const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
  await page.getByRole('button', { name: 'Regler', exact: true }).click()
  await expect(page.locator('.byd-rules-panel').getByRole('heading', { name: 'Så spelar ni' })).toBeVisible()
  expect(await titleOf(page)).toEqual(BOOK_TITLE)
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

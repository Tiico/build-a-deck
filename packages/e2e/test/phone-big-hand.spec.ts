import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Handen på telefonen med många kort (#767, beställarens beslut A + B). Med 25 kort var remsan
// 3 615 px i en ruta på 358 px, tre kort syntes åt gången och inget sade var i handen man stod.
// «Visa alla · 25» bredvid «Dina kort» öppnar hela handen i ett rutnät, som /online har (K17), och
// under remsan står vilka kort som syns av hur många.
test.use({ locale: 'sv-SE' })

test('25 kort på telefonen: hela handen ett tryck bort, och remsan säger var man är (#767)', async ({ tableOf, host, player }) => {
  const table = await tableOf({ players: 4, counters: [], cards: 40, copies: 1 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 25 }])
  const page = ada.page
  await expect(page.locator('[data-hand-card]')).toHaveCount(25)

  // Var i handen: remsan står vid sitt slut, där det senast dragna kortet ligger.
  const where = page.locator('[data-strip-where]')
  await expect(where).toHaveText(/^\d+–25 av 25$/)
  await page.locator('.byd-strip').evaluate((el) => el.scrollTo({ left: 0 }))
  await expect(where).toHaveText(/^1–\d+ av 25$/)

  // Hela handen, och ett kort därifrån är det valda.
  const all = page.getByRole('button', { name: 'Visa alla · 25' })
  await all.click()
  const sheet = page.getByRole('dialog', { name: 'Hela handen, 25 kort' })
  await expect(sheet.locator('[data-spread-card]')).toHaveCount(25)
  const pick = sheet.locator('[data-spread-card]').nth(12)
  const id = await pick.getAttribute('data-spread-card')
  await pick.click()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator(`[data-hand-card="${id}"]`)).toHaveAttribute('data-selected', 'true')
  await expect(page.locator(`[data-hand-card="${id}"]`)).toBeInViewport()
})

test('en hand som ryms i remsan har ingen «Visa alla» och ingen markör', async ({ tableOf, host, player }) => {
  const table = await tableOf({ players: 4, counters: [], cards: 40, copies: 1 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 2 }])
  await expect(ada.page.locator('[data-hand-card]')).toHaveCount(2)
  await expect(ada.page.getByRole('button', { name: /^Visa alla/ })).toHaveCount(0)
  await expect(ada.page.locator('[data-strip-where]')).toHaveCount(0)
})

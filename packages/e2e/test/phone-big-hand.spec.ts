import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Handen på telefonen med många kort (#767, #1147). Med 25 kort var remsan 3 615 px i en ruta på
// 358 px, tre kort syntes åt gången och inget sade var i handen man stod; «Visa alla · 25» öppnade
// då hela handen i ett rutnät. Sedan flikarna (beställarens val B) är handen det rutnätet: alla
// kort i rader, panelen rullar uppåt och nedåt, och ingenting går i sidled.
test.use({ locale: 'sv-SE' })

test('25 kort på telefonen: hela handen i rutnätet, och varje kort når man genom att rulla panelen (#767, #1147)', async ({ tableOf, host, player }) => {
  const table = await tableOf({ players: 4, counters: [], cards: 40, copies: 1 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 25 }])
  const page = ada.page
  const cards = page.locator('[data-hand-card]')
  await expect(cards).toHaveCount(25)
  await expect(page.getByRole('button', { name: /^Visa alla/ })).toHaveCount(0)

  // Tre i bredd, och inget i sidled — varken sidan eller panelen.
  const laid = await page.evaluate(() => {
    const tops = [...document.querySelectorAll('[data-hand-card]')].map((c) => Math.round(c.getBoundingClientRect().top))
    const panel = document.querySelector('.byd-panels') as HTMLElement
    return {
      perRow: tops.filter((t) => t === tops[0]).length,
      sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth + panel.scrollWidth - panel.clientWidth,
      down: panel.scrollHeight > panel.clientHeight,
    }
  })
  expect(laid).toEqual({ perRow: 3, sideways: 0, down: true })

  // Ett kort långt ner i handen: rullat fram, tryckt, och raden över flikarna säger dess namn.
  const deep = cards.nth(19)
  await deep.scrollIntoViewIfNeeded()
  await deep.tap()
  await expect(deep).toHaveAttribute('data-selected', 'true')
  const name = (await deep.textContent())!.trim()
  await expect(page.locator('[data-hand-bar] strong')).toHaveText(name)
})

import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A card played from the hand with the keyboard leaves focus on the hand, not on nothing (#559 P-3,
// K16). The button pressed goes with the card — «Kasta» offers nothing once nothing is chosen — and
// focus used to fall to BODY, so the next Tab began again at the header.
test('after «Kasta» from the keyboard, focus stands on the next card in the hand', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = ada.page
  const strip = page.locator('.byd-strip[data-hand] [data-hand-card]')
  await expect(strip).toHaveCount(3)
  const region = page.getByRole('region', { name: /Spela valda kort|Play selected cards/ })
  const discard = region.getByRole('button', { name: 'Kasta' })
  await expect(discard).toBeVisible()
  for (let i = 0; i < 40 && !(await discard.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(discard).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(strip).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-hand-card') ?? document.activeElement?.tagName)).toMatch(/^c/)
  // And it is the strip's one tab stop, so the next Tab goes on from the hand and not the header.
  await expect(page.locator('[data-hand-card]:focus')).toHaveAttribute('tabindex', '0')
})

// Tab into the strip lands on the card that is chosen (#559 P-26): it used to land on the first
// card while «Valt» named another, and the first arrow then moved the choice as well as the focus.
test('Tab into the hand lands on the chosen card', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = ada.page
  const strip = page.locator('.byd-strip[data-hand] [data-hand-card]')
  await expect(strip).toHaveCount(3)
  const chosen = page.locator('.byd-strip[data-hand] [data-hand-card][aria-pressed="true"]')
  await expect(chosen).toHaveCount(1)
  // Non-vacuity: the chosen card is not the strip's first, which is where Tab used to land.
  expect(await strip.first().getAttribute('aria-pressed')).not.toBe('true')
  for (let i = 0; i < 40 && !(await page.evaluate(() => document.activeElement?.hasAttribute('data-hand-card') ?? false)); i++) await page.keyboard.press('Tab')
  await expect(chosen).toBeFocused()
})

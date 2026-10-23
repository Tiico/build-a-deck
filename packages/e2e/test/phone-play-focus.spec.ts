import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A card played from the hand with the keyboard leaves focus on the hand, not on nothing (#559 P-3,
// K16). The button pressed goes with the card — the bar over the tabs goes once nothing is marked
// (#1147) — and focus used to fall to BODY, so the next Tab began again at the header.
test('after «Kasta» from the keyboard, focus stands on the next card in the hand', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = ada.page
  const grid = page.locator('[data-hand] [data-hand-card]')
  await expect(grid).toHaveCount(3)
  await grid.first().tap()
  const region = page.getByRole('region', { name: /Spela valda kort|Play selected cards/ })
  const discard = region.getByRole('button', { name: /^(Kasta|Discard)$/ })
  await expect(discard).toBeVisible()
  for (let i = 0; i < 40 && !(await discard.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(discard).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(grid).toHaveCount(2)
  await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute('data-hand-card') ?? document.activeElement?.tagName)).toMatch(/^c/)
  // And it is the grid's one tab stop, so the next Tab goes on from the hand and not the header.
  await expect(page.locator('[data-hand-card]:focus')).toHaveAttribute('tabindex', '0')
})

// Tab into the hand lands on the card marked last (#559 P-26): it used to land on the first card
// while the bar named another, and the first arrow then moved the choice as well as the focus.
test('Tab into the hand lands on the card marked last', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const page = ada.page
  const grid = page.locator('[data-hand] [data-hand-card]')
  await expect(grid).toHaveCount(3)
  // The second marked, then the third marked and unmarked again: the third was pressed last, and
  // the second is the one marked last.
  await grid.nth(1).tap()
  await grid.nth(2).tap()
  await grid.nth(2).tap()
  const marked = page.locator('[data-hand] [data-hand-card][aria-pressed="true"]')
  await expect(marked).toHaveCount(1)
  await expect(marked).toHaveAttribute('data-hand-card', (await grid.nth(1).getAttribute('data-hand-card'))!)
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let i = 0; i < 40 && !(await page.evaluate(() => document.activeElement?.hasAttribute('data-hand-card') ?? false)); i++) await page.keyboard.press('Tab')
  await expect(marked).toBeFocused()
})

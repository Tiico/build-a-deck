import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The reader «Läs stort» opens on a hand card takes focus, and gives it back to what opened it
// (#559 P-4, C4, #1147): «Läs stort», which is still there with the card still marked.
// It used to leave focus on BODY: a screen reader was never told the reader had opened, Escape did
// nothing because focus was outside it, and «Stäng» left focus nowhere. The same reader opened from
// the table's areas did it right; this holds the hand to the same.
test('a card read from the hand takes focus, and Escape and «Stäng» give it back to «Läs stort»', async ({ tableOf, player, host }) => {
  const table = await tableOf({ players: 2, cards: 8 })
  const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
  const dealer = await host(table)
  await dealer.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
  const grid = ada.page.locator('[data-hand] [data-hand-card]')
  await expect(grid).toHaveCount(3)
  const card = grid.nth(1)
  const read = ada.page.getByRole('button', { name: 'Read large' })
  const held = ada.page.locator('.byd-inspect')
  const focused = () => ada.page.evaluate(() => {
    const el = document.activeElement
    return el?.getAttribute('data-hand-card') ?? el?.className ?? el?.tagName ?? null
  })

  await card.tap()
  await read.tap()
  await expect(held).toBeVisible()
  // Past the click the browser makes of the touch (UX-30), focus is inside the reader.
  await ada.page.waitForTimeout(400)
  await expect.poll(focused).toBe('byd-inspect-close')
  await ada.page.keyboard.press('Escape')
  await expect(held).toHaveCount(0)
  await expect(read).toBeFocused()

  await read.tap()
  await expect(held).toBeVisible()
  await ada.page.waitForTimeout(400)
  await held.locator('.byd-inspect-close').tap()
  await expect(held).toHaveCount(0)
  await expect(read).toBeFocused()
})

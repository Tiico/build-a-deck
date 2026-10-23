import { join } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Dice on the felt (#1137, K28 variant A), in the built app: a game with 2d6 in its setup lays two
// dice on the floor, a click on one rolls it, it tumbles, and the side it lands on is the log's —
// the same figure on the seat's own screen and on the room's television, and the same figure the
// line under the felt tells.
test.describe('a die rolled from the felt (#1137)', () => {
  test.use({ viewport: DESK.viewport })

  test('a click rolls it, it tumbles, and both screens land on the value the log tells', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, dice: [{ faces: 6, count: 2, zone: 'table' }] })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
    const { page: tv } = await open(DESK, `${table.tvUrl}&lang=sv`)

    const dice = page.locator('.byd-die[data-kind="d6"]')
    await expect(dice).toHaveCount(2)
    await expect(tv.locator('.byd-die[data-kind="d6"]')).toHaveCount(2)
    const first = dice.first()
    const id = await first.getAttribute('data-die')
    await expect(first).toHaveAttribute('aria-label', /^d6, visar 1, i Spelyta\. Enter slår tärningen\.$/)

    await first.click()
    // It tumbles on both screens, by the log line that says it was rolled.
    await expect(first).toHaveAttribute('data-rolling', 'tumble')
    await expect(tv.locator(`[data-die="${id}"]`)).toHaveAttribute('data-rolling', 'tumble')
    const said = page.getByRole('status').filter({ hasText: /slog d6/ })
    await expect(said).toHaveText(/^Du slog d6: [1-6]$/)
    const told = (await said.textContent())!.replace(/^.*: /, '')

    await expect(first).not.toHaveAttribute('data-rolling', /./)
    await expect(tv.locator(`[data-die="${id}"]`)).not.toHaveAttribute('data-rolling', /./)
    await expect(first.locator('[data-die-value]')).toHaveText(told)
    await expect(tv.locator(`[data-die="${id}"] [data-die-value]`)).toHaveText(told)
    await expect(first).toHaveAttribute('aria-label', `d6, visar ${told}, i Spelyta. Enter slår tärningen.`)
  })

  test('Enter on a die with the keyboard’s focus rolls it, and the focus stays on it', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, dice: [{ faces: 20, count: 1, zone: 'table' }] })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
    const die = page.locator('.byd-die[data-kind="d20"]')
    await expect(die).toHaveCount(1)

    await die.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: /slog d20/ })).toHaveText(/^Du slog d20: \d+$/)
    await expect(die).toBeFocused()
  })
})

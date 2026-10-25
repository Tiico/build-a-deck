import { join, withQuery } from '../support/api.js'
import { pastTheWaitingRoom } from '../support/waiting.js'
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
    const { page } = await open(DESK, withQuery(seat.onlineUrl, `lang=sv`))
    const { page: tv } = await open(DESK, withQuery(table.tvUrl, 'lang=sv'))
    // Nothing has happened at the table yet, so the waiting room lies over the dice (L77).
    await pastTheWaitingRoom(page)

    const dice = page.locator('.byd-die[data-kind="d6"]')
    await expect(dice).toHaveCount(2)
    await expect(tv.locator('.byd-die[data-kind="d6"]')).toHaveCount(2)
    const first = dice.first()
    const id = await first.getAttribute('data-die')
    await expect(first).toHaveAttribute('aria-label', /^d6, visar 1, i Spelyta\. Enter slår tärningen, M flyttar den\.$/)

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
    await expect(first).toHaveAttribute('aria-label', `d6, visar ${told}, i Spelyta. Enter slår tärningen, M flyttar den.`)
  })

  test('Enter on a die with the keyboard’s focus rolls it, and the focus stays on it', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, dice: [{ faces: 20, count: 1, zone: 'table' }] })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, withQuery(seat.onlineUrl, `lang=sv`))
    const die = page.locator('.byd-die[data-kind="d20"]')
    await expect(die).toHaveCount(1)

    await die.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: /slog d20/ })).toHaveText(/^Du slog d20: \d+$/)
    await expect(die).toBeFocused()
  })

  // K16 (#1169): the keyboard reaches what the pointer reaches. A die is moved by M, which opens
  // the same «Flytta till» a card and a chip move by; Enter still rolls it. Every press is a real
  // one — Tab onto the felt, the arrows to the die — since element.focus() draws no ring and skips
  // the path a person without a mouse takes.
  test('M on a die with the keyboard’s focus moves it to the place chosen, and the focus goes with it', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, dice: [{ faces: 20, count: 1, zone: 'table' }] })
    const seat = await join(request, table, { name: 'Bo', seat: 'A' })
    const { page } = await open(DESK, withQuery(seat.onlineUrl, `lang=sv`))
    const die = page.locator('.byd-die[data-kind="d20"]')
    await expect(die).toHaveCount(1)
    const id = await die.getAttribute('data-die')
    await expect(die).toHaveAttribute('aria-label', 'd20, visar 1, i Spelyta. Enter slår tärningen, M flyttar den.')

    const focused = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.kbd ?? null)
    // Tab until the felt holds the focus, then the arrows to the die: the felt is one tab stop.
    for (let i = 0; i < 40 && (await focused()) === null; i++) await page.keyboard.press('Tab')
    for (let i = 0; i < 20 && (await focused()) !== `die:${id}`; i++) await page.keyboard.press('ArrowRight')
    await expect(die).toBeFocused()

    await page.keyboard.press('m')
    const panel = page.getByRole('dialog', { name: /d20/ })
    await expect(panel).toBeVisible()
    // Moving is all M opens: the roll stays on Enter, and no row offers it here.
    await expect(panel.getByRole('button', { name: /^Slå/ })).toHaveCount(0)
    const place = panel.getByRole('group', { name: 'Flytta till' }).getByRole('button', { name: /^Framför A/ })
    await expect(place).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(panel).toBeHidden()
    await expect(page.getByRole('status').filter({ hasText: /flyttade d20/ })).toHaveText(/^Du flyttade d20 till /)
    await expect(die).toHaveAttribute('aria-label', 'd20, visar 1, i Framför A. Enter slår tärningen, M flyttar den.')
    await expect(die).toBeFocused()
  })
})

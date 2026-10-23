import { join } from '../support/api.js'
import { DESK, PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Vems tur det är (K30, #1141), som två spelare möter det: Ada vid en dator på /online och Bo med
// telefonen. Den som satte sig först har turen, «Klar» skickar den vidare, och båda skärmarna och
// båda flikarna säger samma sak.
test.describe('the turn passed on between a laptop and a phone (K30)', () => {
  test('Ada has the turn first, «Klar» gives it to Bo, and both screens say so', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 6, turns: 'clockwise' })
    const ada = await join(request, table, { name: 'Ada', seat: 'A' })
    const { page } = await open(DESK, `${ada.onlineUrl}&lang=sv`)
    // A seat is taken when its screen sits down, and the first to sit down has the turn.
    const mine = page.locator('[data-seat-name="A"]')
    await expect(mine).toContainText('Din tur')
    const bo = await open(PHONE, `${(await join(request, table, { name: 'Bo', seat: 'B' })).playUrl}&lang=sv`)
    await expect(page.locator('[data-turn-band="A"]')).toBeVisible()
    await expect(page).toHaveTitle(/^● Din tur · /)
    await expect(bo.page.getByText('Adas tur')).toBeVisible()
    await expect(bo.page).not.toHaveTitle(/Din tur/)

    await mine.getByRole('button', { name: 'Klar, ge turen till Bo' }).click()

    await expect(page.locator('[data-seat-name="B"]')).toContainText('Bos tur')
    await expect(page.locator('[data-turn-band="B"]')).toBeVisible()
    await expect(page).not.toHaveTitle(/Din tur/)
    await expect(page.getByRole('status').filter({ hasText: 'Du gav turen till Bo' })).toBeVisible()
    await expect(bo.page.getByText('Din tur')).toBeVisible()
    await expect(bo.page).toHaveTitle(/^● Din tur · /)

    await bo.page.getByRole('button', { name: 'Klar, ge turen till Ada' }).click()
    await expect(mine).toContainText('Din tur')
    await expect(bo.page.getByText('Adas tur')).toBeVisible()
  })
})

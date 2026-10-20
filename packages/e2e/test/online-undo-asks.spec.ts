import { join } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// «Ångra» after somebody else's move on the distance view (#747, beställarens beslut A). It sent a
// rewind proposal on the press: Bo was asked to decide on taking back the host's deal, and «Visa
// alla» stood over the table the proposal shows. Now the press asks first, naming the move and who
// decides; the proposal closes «Visa alla», and its banner names the move.
test.describe('Ångra after another seat’s move on /online (#747)', () => {
  test.use({ viewport: DESK.viewport })

  test('asks first, and once proposed closes «Visa alla» and names the move', async ({ tableOf, open, host, request, player }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 8, copies: 1 })
    const dealer = await host(table)
    const ada = await join(request, table, { name: 'Ada', seat: 'A' })
    // Bo sits at the table, so he is the one who decides.
    await player(table, { name: 'Bo', seat: 'B' })
    const { page } = await open(DESK, `${ada.onlineUrl}&lang=sv`)
    await page.locator('.byd-pile[data-zone="draw"] .byd-pile-top').click()
    await page.getByRole('button', { name: 'Dra 1', exact: true }).click()
    await expect(page.locator('[data-hand-card]')).toHaveCount(1)
    // The table deals Bo a card: the last move is no longer Ada's.
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:B', count: 1 }])
    await expect(page.getByRole('status').filter({ hasText: /till Bos hand/ })).toBeVisible()

    await page.getByRole('button', { name: 'Visa alla' }).click()
    await expect(page.getByRole('button', { name: 'Visa alla' })).toHaveAttribute('aria-expanded', 'true')
    await page.getByRole('button', { name: /Ångra/ }).click()
    const ask = page.getByRole('dialog', { name: 'Senaste draget är inte ditt' })
    await expect(ask).toBeVisible()
    await expect(ask).toContainText('och Bo avgör.')
    await expect(ask.getByRole('button', { name: 'Avbryt' })).toBeFocused()

    await ask.getByRole('button', { name: 'Föreslå att spola tillbaka' }).click()
    await expect(page.getByText(/^Du föreslår att spola tillbaka till hur bordet såg ut före «Du drog 1 kort från Draghög till din hand»\. Bo avgör\.$/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Visa alla' })).toHaveAttribute('aria-expanded', 'false')
  })
})

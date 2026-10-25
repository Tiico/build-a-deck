import { logIn, makeProject, startTable } from '../support/api.js'
import { PHONE, SMALL_TV, type Device } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A computer at a table around a TV (#1310, beställarens beslut A i #1308). Since L86 «Gå med» at a
// table started «Runt en skärm» leads every screen to the hand on `/play`; a computer's window gets
// the hand along its foot in full size and the places a card can be played to as targets over it,
// where a phone keeps its four tabs (C4). The mouse does what it does in `/online`'s hand (K11,
// #1291): a click turns the card, a drag onto a target plays it.
test.describe('the hand at a computer by a table around a TV (#1310)', () => {
  for (const device of [
    SMALL_TV,
    { name: 'desk-1024', viewport: { width: 1024, height: 768 } },
  ] satisfies Device[]) {
    test(`joins through «Gå med» and plays a card by dragging it onto «Framför mig» at ${device.viewport.width} × ${device.viewport.height}`, async ({ request, open, host }) => {
      await logIn(request)
      const project = await makeProject(request, { name: 'Fredagskort', players: 2, counters: [], cards: 6 })
      const table = { ...(await startTable(request, project.id, 'screen')), seats: ['A', 'B'] }
      const dealer = await host(table)
      await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 3 }])

      const { page } = await open(device, `/${table.code}?lang=sv`, { facesReady: true })
      await expect(page.getByText('Du får handen. Bordet står på TV:n.')).toBeVisible()
      await page.getByLabel('Ditt namn').fill('Kim')
      await page.getByRole('button', { name: 'Gå med', exact: true }).click()
      await page.waitForURL('**/play*')

      // The desk and not the phone: no tabs, the hand in a row, the targets over it.
      await expect(page.locator('[data-desk]')).toBeVisible()
      await expect(page.getByRole('tablist')).toHaveCount(0)
      const cards = page.locator('[data-hand-row] [data-hand-card]')
      await expect(cards).toHaveCount(3)
      const mine = page.locator('[data-drop-zone="mine:A"]')
      await expect(mine).toBeVisible()
      await expect(page.locator('.byd-desk-where')).toBeVisible()

      // A click turns the card over and sends nothing; a second turns it back.
      const card = cards.nth(1)
      const name = await card.getAttribute('data-hand-card')
      await card.click()
      await expect(card).toHaveAttribute('data-turned', 'true')
      await card.click()
      await expect(card).not.toHaveAttribute('data-turned', 'true')
      await expect(page.getByRole('dialog')).toHaveCount(0)

      // Dragged up onto «Framför mig», the target says it is the one, and the card lands there face up.
      const from = (await card.boundingBox())!
      const to = (await mine.boundingBox())!
      await page.mouse.move(from.x + from.width / 2, from.y + 30)
      await page.mouse.down()
      await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 3 })
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
      await expect(mine).toHaveAttribute('data-aim', '')
      await page.mouse.up()
      await expect(cards).toHaveCount(2)
      await expect(page.locator(`[data-hand-card="${name}"]`)).toHaveCount(0)
      await expect(mine.locator('[data-area-card]')).toHaveCount(1)
      await expect(mine.locator('header')).toContainText(/1 (kort|card)$/)
      // The page itself never scrolls (L10).
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)).toBe(true)
    })
  }

  test('a phone at the same table keeps the four tabs', async ({ request, open }) => {
    await logIn(request)
    const project = await makeProject(request, { name: 'Fredagskort', players: 2, counters: [], cards: 6 })
    const table = await startTable(request, project.id, 'screen')
    const { page } = await open(PHONE, `/${table.code}?lang=sv`, { facesReady: true })
    await page.getByLabel('Ditt namn').fill('Bo')
    await page.getByRole('button', { name: 'Gå med', exact: true }).click()
    await page.waitForURL('**/play*')
    await expect(page.getByRole('tablist')).toBeVisible()
    await expect(page.locator('[data-desk]')).toHaveCount(0)
  })
})

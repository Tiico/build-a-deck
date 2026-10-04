import { join, logIn, makeProject, startTable } from '../support/api.js'
import { PHONE, SMALL_TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A game taken away from «Mina spel» takes its tables with it (#676), as the question promised
// («Hela historien följer med»). Before, the code went on seating newcomers, the phones played on,
// and the owner's own table screen said the table belonged to another account.
test('ends the tables of a deleted game on every screen, and its code seats nobody', async ({ open, request }) => {
  const owner = await open(SMALL_TV, '/')
  await logIn(owner.page.request)
  const { id } = await makeProject(owner.page.request, { players: 2 })
  const table = await startTable(owner.page.request, id)
  const tv = `/table?session=${encodeURIComponent(table.session)}&owner=1&mode=tv`
  await owner.page.goto(tv)
  await expect(owner.page.getByText(table.code)).toBeVisible()

  const seat = await join(request, { ...table, seats: [] }, { name: 'Ada', seat: 'A' })
  const ada = await open(PHONE, seat.playUrl)
  await expect(ada.page.locator('.byd-survey')).toHaveCount(0)

  const removed = await owner.page.request.delete(`/projects/${encodeURIComponent(id)}`)
  expect(removed.status()).toBe(200)

  // The phone at the table is told it has ended, without anyone touching it, and so is the TV.
  await expect(ada.page.locator('.byd-survey')).toBeVisible()
  await expect(owner.page.locator('[data-ended]')).toBeVisible()
  // The code no longer opens the seat picker.
  expect((await request.get(`/rooms/${table.code}`)).status()).toBe(410)
  const newcomer = await open(PHONE, `/join?code=${table.code}`)
  await expect(newcomer.page.getByRole('heading', { name: 'The table is over' })).toBeVisible()
  await expect(newcomer.page.getByRole('button', { name: /^Ada/ })).toHaveCount(0)
  // And the owner's screen, opened again, says the game is gone — not that it is someone else's.
  await owner.page.goto(tv)
  await expect(owner.page.getByRole('heading', { name: 'The game was deleted' })).toBeVisible()
  await expect(owner.page.getByText(/another account/)).toHaveCount(0)
})

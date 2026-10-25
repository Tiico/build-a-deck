import { join, withQuery } from '../support/api.js'
import { DESK } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Each plate on the room's television carries its seat's letter in the ball (#573, beslut C; #683,
// beslut E: «(B) ledig 5 kort»), whoever sits there. The ball took the first letter of the name
// instead, so with Bo on A both plates said «B» — «B ledig» and «B Bo» (#1171).
test('the ball on each plate is the seat’s letter, not the first letter of who sits there (#1171)', async ({ tableOf, open, request }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 4 })
  const bo = await join(request, table, { name: 'Bo', seat: 'A' })
  await open(DESK, withQuery(bo.onlineUrl, `lang=sv`))
  const { page: tv } = await open(DESK, withQuery(table.tvUrl, 'lang=sv'))

  const a = tv.locator('[data-seat-plate="A"] > b')
  const b = tv.locator('[data-seat-plate="B"] > b')
  await expect(a).toContainText('Bo')
  await expect(b).toContainText('ledig')
  await expect(a.locator('i')).toHaveText('A')
  await expect(b.locator('i')).toHaveText('B')
})

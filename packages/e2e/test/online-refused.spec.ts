import { join } from '../support/api.js'
import { SMALL_TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A seat whose link no longer holds, on /online (#484 fynd 8, D5). It was told what the table
// screen is told — «Bordet hör till ett annat konto», with a login and «Till mina spel» — which is
// the host's door and no way back to a seat. /online is a seat like /play, so it is told what a
// phone is told, and the first way out is the room's own picker, found by the code in the address.
test.describe('a seat refused on /online (#484)', () => {
  test.use({ viewport: SMALL_TV.viewport })

  test('says the seat is no longer yours, and offers the seat picker again', async ({ tableOf, open, request }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4, copies: 1 })
    const seat = await join(request, table, { name: 'Ada', seat: 'A' })
    const url = new URL(seat.onlineUrl, 'http://x')
    url.searchParams.set('token', 'not-a-token-any-longer')
    url.searchParams.set('code', table.code)
    url.searchParams.set('lang', 'sv')
    const { page } = await open(SMALL_TV, `${url.pathname}${url.search}`)
    await expect(page.getByRole('heading', { name: 'Din plats är inte längre din' })).toBeVisible()
    const again = page.getByRole('link', { name: 'Välj plats igen' })
    await expect(again).toBeVisible()
    expect(await again.getAttribute('href')).toBe(`/join?code=${table.code}`)
  })
})

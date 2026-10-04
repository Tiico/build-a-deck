import { TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The host key in the television's address bar (#758, DRIFT §9). The key opens the table's own
// view, rotates the room code and kicks seats, and DRIFT says it is shown once. A screen share, a
// photo of the TV or a shared tab showed it for as long as the table stood, because the address
// kept it. The screen takes it out of the address on arrival and keeps it in the tab instead, so
// a reload still opens the table and the address bar and the history never hold it.
test.describe('the host key in the address (#758)', () => {
  test('is gone from the address once the table is open, and a reload still opens it', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, `${table.tvUrl}&lang=sv`)
    await expect(page.locator('.byd-pile').first()).toBeVisible()

    const shown = new URL(page.url())
    expect(shown.searchParams.has('host'), 'the address bar does not hold the key').toBe(false)
    expect(page.url()).not.toContain(table.hostKey)
    // What else the address says is kept: which table, which screen, which language.
    expect(shown.searchParams.get('session')).toBe(table.session)
    expect(shown.searchParams.get('mode')).toBe('tv')
    expect(shown.searchParams.get('lang')).toBe('sv')

    await page.reload()
    await expect(page.locator('.byd-pile').first(), 'a reload opens the table again').toBeVisible()
    expect(new URL(page.url()).searchParams.has('host')).toBe(false)
  })
})

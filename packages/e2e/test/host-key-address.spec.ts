import { withQuery } from '../support/api.js'
import { TV } from '../support/devices.js'
import { watchRequests } from '../support/requests.js'
import { expect, test } from '../support/test.js'

// The host key in the television's address bar (#758, DRIFT §9). The key opens the table's own
// view, rotates the room code and kicks seats, and DRIFT says it is shown once. A screen share, a
// photo of the TV or a shared tab showed it for as long as the table stood, because the address
// kept it. The screen takes it out of the address on arrival and keeps it in the tab instead, so
// a reload still opens the table and the address bar and the history never hold it.
test.describe('the host key in the address (#758)', () => {
  test('is gone from the address once the table is open, and a reload still opens it', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const { page } = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
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

// «Ny kod» takes a leaked key back (#820): the code and the host key change together, so an
// address that leaked before opens nothing after. The television that is already open is handed
// the new key over its own connection and keeps it in the tab, so it is not shut out by its own
// rotation — and a telephone at the same table never has the key on its wire.
test.describe('a new code takes the host key with it (#820)', () => {
  test('the open television keeps the table through a reload, the old address is shut, and a phone never hears the key', async ({ table, open, player, request }) => {
    const tv = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
    await expect(tv.page.getByText(table.code)).toBeVisible()
    const ada = await player(table, { name: 'Ada', ...(table.seats[0] ? { seat: table.seats[0] } : {}) })
    await ada.wire.until((frame) => frame.includes('"snapshot"'))

    // What «Ny kod» sends, with the key the table was started with.
    const rotated = await request.post(`/sessions/${encodeURIComponent(table.session)}/code`, { headers: { authorization: `Bearer ${table.hostKey}` } })
    expect(rotated.status()).toBe(200)
    const { code, hostKey } = (await rotated.json()) as { code: string; hostKey: string }
    expect(hostKey).not.toBe(table.hostKey)

    await expect(tv.page.getByText(code), 'the open television shows the new code').toBeVisible()
    await tv.wire.until((frame) => frame.includes(hostKey))
    // The table's frames went out to the phone too; the key was not among them.
    expect(ada.wire.received().join('\n'), 'the phone was never sent the new key').not.toContain(hostKey)
    expect(ada.wire.received().join('\n'), 'nor the old one').not.toContain(table.hostKey)

    await tv.page.reload()
    await expect(tv.page.getByText(code), 'a reload opens the table with the key it was handed').toBeVisible()
    expect(tv.page.url()).not.toContain(hostKey)

    // The address that leaked opens nothing now.
    const leaked = await open(TV, withQuery(table.tvUrl, 'lang=sv'))
    await expect(leaked.page.locator('[data-status-notice]').getByRole('heading', { level: 1 })).toHaveText('Bordet kräver värdens länk eller ägarens inloggning')
    await expect(leaked.page.getByText(code)).toHaveCount(0)
  })
})

// The suite opens the table the way the product hands it out (#1335): the editor puts the key in
// the fragment since #1306, so a helper that put it in the query tried only the old form, and every
// journey that opened a screen passed on a road no new link takes. `owner-address.spec.ts` is the
// one that tries the old form, on purpose, and is refused (#1341).
test.describe('the suite’s own way to the table (#1335)', () => {
  test('carries the key in the fragment, and no request the screen makes says it', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 2, counters: [], cards: 4 })
    const given = new URL(table.tvUrl, 'http://x.invalid')
    expect(given.searchParams.has('host'), 'the helper puts no key in the query').toBe(false)
    expect(given.hash).toBe(`#host=${table.hostKey}`)

    const { page, context } = await open(TV, 'about:blank')
    const requests = watchRequests(context)
    await page.goto(table.tvUrl)
    await expect(page.getByText(table.code), 'the key in the fragment opens the table').toBeVisible()
    await requests.closeAndRead()
    expect(requests.seen.some(({ url }) => url.startsWith('ws') && url.includes('/sessions/')), 'the table’s socket was read').toBe(true)
    for (const { url, referer } of requests.seen) {
      expect(url, 'the key in the address of a request').not.toContain(table.hostKey)
      expect(referer ?? '', `the key in the Referer of ${url}`).not.toContain(table.hostKey)
    }
  })
})

import { PostgresLogStore } from '@byd/server'
import { PHONE, TV } from '../support/devices.js'
import { join } from '../support/api.js'
import { mentions, watchWire } from '../support/frames.js'
import { slowLine, type SlowLine } from '../support/latency.js'
import { expect, test } from '../support/test.js'

// A guest whose phone was reloaded leaves and removes her name (#1348, G6, L87). The reload is
// what matters: a page that sat her down itself knows it did, and a page opened onto a seat she
// already holds has never claimed anything. When the release then freed the seat, that page sat
// her straight back down under her name, after the erasure, and every screen at the table said
// her name again. Proved on the wire, as hidden information is (CLAUDE.md): the frames the table
// and another phone were sent after the erasure, what a screen that connects afterwards is sent,
// and the table's own log in the database.

// A name no word of the product's contains, so that finding it means finding her.
const NAME = 'Vendela Qvist'

test('a reloaded phone that leaves and removes her name does not sit down again, and no screen is sent the name after', async ({ tableOf, player, open, host, request, baseURL, browser }) => {
  const table = await tableOf({ players: 2, counters: [], cards: 6, copies: 1 })
  const tv = await open(TV, table.tvUrl, { facesReady: true })
  // Her phone reaches the table over a line of its own, which is slowed below.
  const line = await slowLine(baseURL ?? '')
  try {
    await journey(line)
  } finally {
    await line.stop()
  }
  async function journey(slow: SlowLine) {
    const admission = await join(request, table, { name: NAME, seat: 'A' })
    // Opened here and not through `open`: that one proxies the socket through Playwright, which
    // answers the server's closing handshake itself, and the line under test is the real one.
    const context = await browser.newContext({ viewport: PHONE.viewport, hasTouch: true, isMobile: true })
    const ada = { page: await context.newPage() }
    const wire = watchWire(ada.page)
    await ada.page.goto(`${slow.origin}${admission.playUrl}`)
    const bo = await player(table, { name: 'Bo', seat: 'B', device: PHONE })
    await expect(ada.page.getByText(NAME).first()).toBeVisible()
    await bo.wire.until((frame) => frame.includes(NAME))
    await tv.wire.until((frame) => frame.includes(NAME))

    // Her phone is reloaded, and opens onto the seat she already holds.
    await ada.page.reload()
    await expect(ada.page.getByText(NAME).first()).toBeVisible()
    // And from here on the table's answers reach her phone the way they do on the box: each frame
    // drawn before the next arrives (see `slowLine`).
    slow.delay(60)
    const sent = wire.sent().length
    const tvSeen = tv.wire.received().length
    const boSeen = bo.wire.received().length

    await ada.page.getByRole('tab', { name: /^More/ }).tap()
    await ada.page.getByRole('button', { name: 'Leave… or end the table' }).tap()
    await ada.page.getByRole('dialog', { name: 'Leave the table?' }).getByRole('button', { name: 'Leave and remove my name…' }).tap()
    await ada.page.getByRole('alertdialog', { name: 'Leave and remove your name?' }).getByRole('button', { name: 'Yes, leave and remove' }).tap()
    await expect(
      ada.page.getByRole('heading', {
        name: 'You have left the table, and your name is removed.',
      }),
    ).toBeVisible()

    // A line from the table after hers, so that anything her phone sent on the way out has been
    // decided by the time the screens are read: the table decides one envelope at a time.
    await (await host(table)).send([{ v: 'flag', note: 'efter' }])
    await tv.wire.until((frame) => frame.includes('efter'))
    await bo.wire.until((frame) => frame.includes('efter'))

    // Neither the table nor the other phone was sent her name again.
    expect(mentions(tv.wire.received().slice(tvSeen), NAME)).toEqual([])
    expect(mentions(bo.wire.received().slice(boSeen), NAME)).toEqual([])
    // Her phone asked for no seat on the way out.
    expect(wire.sent().slice(sent).filter((frame) => frame.includes('seat.claim'))).toEqual([])
    // Seat A stands empty.
    await expect(tv.page.getByText(NAME)).toHaveCount(0)

    // A screen that connects now is sent her name in no frame.
    const later = await open(TV, table.tvUrl, { facesReady: true })
    await later.wire.until((frame) => frame.includes('"snapshot"'))
    expect(later.wire.received().join('\n')).not.toContain(NAME)

    // And the table's log in the database does not hold it. A run on the memory store has only
    // the frames above, which are read from the log.
    const url = process.env['BYD_E2E_DATABASE_URL']
    if (url) {
      const store = PostgresLogStore.connect(url)
      try {
        expect(JSON.stringify(await store.read(table.session))).not.toContain(NAME)
      } finally {
        await store.close()
      }
    }
    await context.close()
  }
})

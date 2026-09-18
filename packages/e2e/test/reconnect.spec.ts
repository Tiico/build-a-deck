import { PHONE, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// A connection that goes and comes back (D5, D3).
//
// Three of D5's nine states can only happen to a client that already holds data — lost, restored,
// and refused — and two of those are here. They are the states no unit test can reach honestly: a
// mocked socket that is told to close is not a network that went away, because what actually
// happens is that the browser's socket dies while the page, the React tree and every bit of state
// in it stay exactly where they were. The bug lives in that gap.
//
// The felt is a phone's here rather than a table's because a phone is the client that really does
// lose its connection — a television is on a cable and a phone is in a pocket, on a train.
test.describe('a connection that goes away', () => {
  test('says so on the phone, and picks the table back up when it returns', async ({ table, player, host }) => {
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const table_ = await host(table)
    await table_.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 3 }])
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(3)

    // The line goes. Not a socket closed politely from inside the page — the line, dying without
    // a closing handshake, and staying dead while she is in the tunnel.
    await ada.line.cut()

    // The phone says the line is gone, and puts the view beyond reach while it is (D5: a surface
    // holding data that may now be stale is inert, not merely greyed).
    await expect(ada.page.locator('.byd-status-stale'), 'the phone says the connection is gone').toBeVisible({ timeout: 30_000 })

    // Meanwhile the game goes on without her, which is the case that makes reconnection hard:
    // she has to come back to a table that moved, not to the one she left.
    await table_.send([{ v: 'deal', from: 'draw', to: ['hand:A'], each: 2 }])

    ada.line.restore()

    // She is back, and holding five cards — the three she had and the two dealt while she was
    // away. Nothing was asked for: the actor hands over its document on the new connection.
    await expect(ada.page.locator('.byd-status-stale')).toHaveCount(0, { timeout: 30_000 })
    await expect(ada.page.locator('[data-hand-card]'), 'she comes back to the table as it is now, not as she left it').toHaveCount(5)

    // And it really was a second socket, rather than one that never noticed.
    expect(ada.wire.sockets(), 'the phone opened a new connection rather than pretending').toBeGreaterThan(1)
  })

  test('keeps the seat while the phone is away', async ({ table, player, open }) => {
    // A seat is not released because a phone blinked. If it were, a tunnel would cost you your
    // hand — and the seat would be taken by the time you came out of it.
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const tv = await open(TV, table.tvUrl)
    await expect(tv.page.locator('.byd-tv-seats')).toContainText('Ada')

    await ada.line.cut()
    await expect(ada.page.locator('.byd-status-stale')).toBeVisible({ timeout: 30_000 })

    // Someone else tries her chair while she is gone and is not given it.
    const takers = await open(PHONE, `/join?code=${table.code}`)
    await expect(takers.page.locator('button[data-seat="A"]')).toHaveAttribute('aria-disabled', 'true')

    ada.line.restore()
    await expect(ada.page.locator('.byd-status-stale')).toHaveCount(0, { timeout: 30_000 })
    await expect(tv.page.locator('.byd-tv-seats')).toContainText('Ada')
  })
})

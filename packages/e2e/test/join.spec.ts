import { PHONE, TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Getting into a game: the television shows a code, a telephone carries it in, and the table
// knows who sat down (DRIFT §9, C8).
//
// This is the first of the journeys D4 asks for — "flera samtidiga klienter för anslutning,
// telefon och QR" — and it is the one that cannot be tested anywhere cheaper. The code is minted
// by the server, drawn by one client, read by a person, typed into a second client, exchanged for
// a token, and spent on a socket. Six hops across two browsers and a wire. Every test that covers
// part of that covers a part that already works.
//
// Nothing here reads the code out of the API response. It is read off the television's own
// screen, because a table that mints a perfectly good code and prints a different one is a table
// nobody can join, and that failure is invisible to anything that does not look.
test.describe('joining a table from the television', () => {
  test('carries the code from the big screen to a phone, and the seat back again', async ({ table, open }) => {
    const tv = await open(TV, table.tvUrl)
    const shown = tv.page.locator('.byd-tv-join strong')
    await expect(shown, 'the television prints the room code beside the picture of it (#225)').toBeVisible()
    const code = (await shown.innerText()).trim()
    // Read from the screen, then held against what the server minted. Both have to be true: the
    // code has to be *a* code and it has to be *this table's*.
    expect(code).toBe(table.code)

    // A person now does what the picture tells them to. The phone is a phone: its own browser,
    // its own storage, 390 px and a touchscreen.
    const phone = await open(PHONE, `/join?code=${code}`)
    await expect(phone.page.locator('[data-page="join"]')).toBeVisible()

    // The seat picker shows the table, not a list: every seat is a place on a felt, and which
    // place is which is the whole of what it answers (#39, #80).
    const seatB = phone.page.locator('button[data-seat="B"]')
    await expect(seatB).toBeVisible()
    await expect(seatB, 'a free seat can be taken').toHaveAttribute('aria-disabled', 'false')
    await seatB.click()
    await expect(seatB).toHaveAttribute('aria-pressed', 'true')

    await phone.page.locator('form input').fill('Signe')
    await phone.page.locator('form button[type="submit"]').click()

    // The phone is holding a hand.
    await phone.page.waitForURL('**/play*')
    await expect(phone.page.locator('[data-page="player"]')).toBeVisible()

    // And the table knows. This is the half that no single-client test can reach: the seat was
    // claimed on one machine and has to appear on another, over a socket nobody prompted.
    await expect(tv.page.locator('.byd-tv-seats')).toContainText('Signe')
  })

  test('refuses a seat that was taken while the phone was looking at it', async ({ table, open, player }) => {
    // Two people reaching for the last seat is not a rare case at a table with one free chair —
    // it is what happens when a group joins at once. The loser has to be told, and told in the
    // picker rather than by an error page, because the thing to do next is choose another seat.
    const phone = await open(PHONE, `/join?code=${table.code}`)
    await phone.page.locator('button[data-seat="C"]').click()
    await phone.page.locator('form input').fill('Kim')

    // Somebody else takes C in the time it took to type a name.
    await player(table, { name: 'Robin', seat: 'C' })

    await phone.page.locator('form button[type="submit"]').click()
    await expect(phone.page.locator('form [role="alert"]'), 'the refusal is said at the control that was refused').toBeVisible()
    // And she is still in the picker, with the table redrawn, rather than on an error page.
    await expect(phone.page.locator('[data-page="join"]')).toBeVisible()
  })

  test('lets someone watch without taking a seat', async ({ table, open }) => {
    // C8: an observer sees everything and everyone sees her. The way in is the same code.
    const phone = await open(PHONE, `/join?code=${table.code}`)
    await phone.page.locator('form input').fill('Moa')
    await phone.page.locator('.byd-join-observe').click()
    // Waited for rather than read straight after the click: buying admission is a round trip to
    // the server, so the address changes a moment after the tap and a bare read of it is a race.
    await phone.page.waitForURL('**/observe*')
  })

  test('says so when the code is not a room', async ({ open }) => {
    const phone = await open(PHONE, '/join?code=ZZZZZZ')
    // The phone's own wording for a room that is not there, on the phone's own surface — not a
    // stack trace and not a blank (UX-07, D5).
    await expect(phone.page.locator('#root')).not.toBeEmpty()
    await expect(phone.page.locator('[data-page="join"]')).toHaveCount(0)
  })
})

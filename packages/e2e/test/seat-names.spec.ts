import type { Device } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// Which way a seat name faces on a felt that has been turned (#418, decision B of 2026-09-22).
//
// The distance view turns the felt so that your own edge lies nearest you (C5). The seat names
// carried a turn of their own as well — the one that makes a name face its owner when the felt
// lies flat on a real table — and the two turns added up: exactly one name of four could be read,
// and it was your own. On a side seat not even that, because a side seat is left unturned (#77)
// while the name kept its edge turn regardless.
//
// The felt that knows who is looking now reads for them. The felt that does not — several people
// around one screen lying on a table — keeps the place card, which is what C5 was about.
//
// Upright is measured on the painted box and not on a declaration: `getBoxQuads` gives the
// element's own top edge where Chromium actually drew it, so a name turned by an ancestor is
// caught just as surely as one turned by itself. A rectangle's box alone cannot tell upright
// from upside down, which is half the fault here, so the angle is read and not the shape.
const LAPTOP: Device = { name: 'laptop', viewport: { width: 1280, height: 800 } }
/** The screen that lies on the table with people sitting round it (C5). */
const TABLE_SCREEN: Device = { name: 'table-screen', viewport: { width: 1280, height: 800 } }

const ANGLES = `() => {
  // The turn Chromium actually painted, gathered up the whole chain of ancestors: an element's
  // own turn and every turn above it. Reading one declaration would have missed the fault, which
  // is precisely that two turns add up.
  //
  // Only the rotation is kept. Translation cannot turn a direction, and the felt's scale is
  // uniform; the individual \`rotate\` property is composed before \`transform\`, as the cascade does.
  const turn = (el) => {
    let m = new DOMMatrix()
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n)
      const t = cs.transform === 'none' ? new DOMMatrix() : new DOMMatrix(cs.transform)
      const r = !cs.rotate || cs.rotate === 'none' ? new DOMMatrix() : new DOMMatrix('rotate(' + cs.rotate + ')')
      m = r.multiply(t).multiply(m)
    }
    const deg = Math.atan2(m.b, m.a) * 180 / Math.PI
    return Math.round(((deg % 360) + 540) % 360 - 180)
  }
  const read = (sel) => [...document.querySelectorAll(sel)].map((el) => ({
    what: el.dataset.seatName || el.dataset.counterToken || el.textContent.trim(),
    deg: turn(el),
  }))
  return { names: read('.byd-seat-name'), tokens: read('.byd-token') }
}`

type Reading = { names: { what: string; deg: number }[]; tokens: { what: string; deg: number }[] }

test.describe('the seat names on a turned felt', () => {
  // Every seat count the recipe lays, and both kinds of edge: at four B is across the felt and C
  // along its side, and past four two people share a side, which is the only way to get seats on
  // one edge (#42). The side seat is the case #77 leaves unturned, where even your own name was
  // on its side.
  for (const { seats, seat } of [
    { seats: 2, seat: 'B' },
    { seats: 4, seat: 'B' },
    { seats: 4, seat: 'C' },
    { seats: 6, seat: 'E' },
    { seats: 8, seat: 'G' },
  ] as const) {
    test(`stands upright in the distance view at ${seats} seats, seen from ${seat}`, async ({ tableOf, player }) => {
      const table = await tableOf({ players: seats, counters: [{ name: 'Liv', start: 6 }] })
      const who = await player(table, { name: 'Bo', seat, device: LAPTOP })
      // The distance view, which is the surface the bug lives on: `/play` is the phone's own
      // surface and draws no felt at all.
      await who.page.goto(who.admission.onlineUrl)

      await expect(who.page.locator('.byd-seat-name')).toHaveCount(seats)
      const seen: Reading = await who.page.evaluate(`(${ANGLES})()`)

      // Non-vacuity: the names were found, and the felt really is turned — otherwise this would
      // read green on a felt that never needed turning and prove nothing about the bug.
      expect(seen.names).toHaveLength(seats)
      const turned = await who.page.evaluate(() => {
        const el = document.querySelector('[data-table]') as HTMLElement
        return getComputedStyle(el).getPropertyValue('--unrotate').trim()
      })
      expect(turned, 'the distance view turned the felt, so the names had something to fight').not.toBe('')

      for (const name of seen.names) {
        expect(name.deg, `«${name.what}» is drawn at ${name.deg}°`).toBe(0)
      }
      // A counter is a number and not a name: its direction carries no ownership, it is a drag
      // target rather than furniture (C4, #67), and at half a turn a six is read as a nine.
      expect(seen.tokens.length, 'the table has counters to read').toBeGreaterThan(0)
      for (const token of seen.tokens) {
        expect(token.deg, `the counter «${token.what}» is drawn at ${token.deg}°`).toBe(0)
      }
    })
  }

  // The other half of the decision, and the half a careless fix would have quietly thrown away.
  // On a screen lying on a table with people round it the felt does not know who is looking, and
  // there the name is still a place card facing its owner — which is what C5 was about.
  test('is still a place card on the screen the room shares, where nobody knows who is looking', async ({ tableOf, open }) => {
    const table = await tableOf({ players: 4, counters: [{ name: 'Liv', start: 6 }] })
    const shared = await open(TABLE_SCREEN, table.tvUrl.replace('mode=tv', 'mode=table'))

    await expect(shared.page.locator('.byd-seat-name')).toHaveCount(4)
    const seen: Reading = await shared.page.evaluate(`(${ANGLES})()`)

    // One name of four faces the reader — the near edge — and the other three face their own
    // seats, which is exactly the felt lying flat that C5 describes.
    const upright = seen.names.filter((n) => n.deg === 0)
    expect(upright, `the near edge reads upright: ${JSON.stringify(seen.names)}`).toHaveLength(1)
    expect(seen.names.filter((n) => n.deg !== 0), 'the other three still face their own seats').toHaveLength(3)

    // And the counter stands upright even here: a six must not be read as a nine on any surface.
    for (const token of seen.tokens) {
      expect(token.deg, `the counter «${token.what}» is drawn at ${token.deg}°`).toBe(0)
    }
  })
})

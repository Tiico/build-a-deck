import { expect, test } from '@playwright/test'
import { join, makeTable } from '../../support/api.js'

// The felt view's own furniture, measured in a real engine: jsdom lays nothing out, and the fault
// this is about is the seat's line and the session's tools growing into each other in the row they
// share (#25).
//
// Migrated from `packages/web/test/online-layout.test.tsx`, which rendered `SeatLine` and
// `SessionButtons` with `renderToStaticMarkup` and pasted three stylesheets around them. Here the
// route is opened with a seat in it, so the row is the row `OnlinePage` actually builds — and the
// long name is a long name somebody joined under, which is the only way it can arrive in the
// product at all.
//
// **The width changed, and that is the point of migrating it.** The old file measured this row at
// 375 × 812 and called itself "the felt view on a phone". Since #99 (C2's revision of 2026-09-16)
// a window whose short side is under 600 gets no board at all — `/online` hands it the player's
// own surface instead — so at 375 there is no `.byd-online-me` to measure and there has not been
// one for two days. Mounting the components directly could not see that: it drew a row the route
// would never have drawn. So the row is measured where the product actually draws it, at the
// smallest window that gets a board — 1024 × 600, the netbook `online-column.test.tsx` holds the
// hand's column to, and the closest call `BOARD_FLOOR` makes.
const NETBOOK = { width: 1024, height: 600 }

/** Two boxes that do not lie over each other: beside each other, or one under the other. */
type Box = { left: number; right: number; top: number; bottom: number }
const apart = (a: Box, b: Box) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top

const boxes = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el) throw new Error(`no ${sel}`)
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
    }
    return { me: box('.byd-online-me'), tools: box('.byd-online-tools'), width: document.documentElement.clientWidth }
  })

test.use({ viewport: NETBOOK })

test.describe('the felt view in the smallest window that gets a board (C5, #99)', () => {
  // Both the ordinary name and one far longer than the screen. The row gives the two ends of
  // itself: one must never lie over the other, or a tap meant for "undo" lands on the name. Where
  // the width runs out the row wraps, and being on a line of one's own is as apart as being at
  // the other end of one.
  for (const [what, name] of [
    ['a name that fits', 'The designer'],
    ['a name far longer than the screen', 'Ada Augusta Byron King, Countess of Lovelace'],
  ] as const) {
    test(`keeps who you are apart from what you can do, with ${what}`, async ({ page, request }) => {
      const table = await makeTable(request, { players: 2 })
      const seat = await join(request, table, { name, seat: 'A' })
      await page.goto(seat.onlineUrl)
      await expect(page.locator('.byd-online-me')).toBeVisible()

      const seen = await boxes(page)
      expect(apart(seen.me, seen.tools), 'the name and the tools never lie over each other').toBe(true)
      expect(seen.me.left).toBeGreaterThanOrEqual(0)
      // The long name gives way rather than pushing the buttons off the side.
      expect(seen.tools.right).toBeLessThanOrEqual(seen.width)
    })
  }
})

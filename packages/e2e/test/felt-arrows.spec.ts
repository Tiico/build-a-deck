import type { Page } from '@playwright/test'
import { join } from '../support/api.js'
import type { Device } from '../support/devices.js'
import { TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

// The felt's arrow keys follow the screen (K16, #572, beställarens beslut D). They used to walk a
// list sorted row by row in the table's own millimetres: ArrowRight went across the table and
// ArrowDown went up, and on /online, where the felt is turned so the reader's own edge is at the
// bottom, a third of all arrows went against their own direction. Real keys in the built app, on
// the television and on a seat whose felt is turned, from every stop and in every direction.
const DESK: Device = { name: 'desk', viewport: { width: 1280, height: 800 } }

type Walk = { from: string; key: string; to: string | null; against: number }

// Every stop on the felt, each arrow pressed from it with a real key, and how far the focus went
// against the arrow on the screen (0 for none). A stop is one of the felt's own nodes.
async function walk(page: Page): Promise<{ stops: number; walks: Walk[] }> {
  const felt = page.locator('[data-kbd^="card:"], [data-kbd^="pile:"], [data-kbd^="counter:"]')
  const keys = await felt.evaluateAll((els) => els.map((el) => el.getAttribute('data-kbd') ?? ''))
  const centre = (key: string) =>
    page.locator(`[data-kbd="${key}"]`).evaluate((el) => {
      const b = el.getBoundingClientRect()
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 }
    })
  const way: Record<string, { x: number; y: number }> = { ArrowRight: { x: 1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, ArrowDown: { x: 0, y: 1 }, ArrowUp: { x: 0, y: -1 } }
  const walks: Walk[] = []
  for (const from of keys) {
    for (const key of Object.keys(way)) {
      await page.locator(`[data-kbd="${from}"]`).focus()
      const a = await centre(from)
      await page.keyboard.press(key)
      const to = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.getAttribute('data-kbd') ?? null)
      if (to === null || to === from) {
        walks.push({ from, key, to: null, against: 0 })
        continue
      }
      const b = await centre(to)
      const along = (b.x - a.x) * way[key]!.x + (b.y - a.y) * way[key]!.y
      walks.push({ from, key, to, against: along < -1 ? Math.round(-along) : 0 })
    }
  }
  return { stops: keys.length, walks }
}

async function laid(dealer: { send(intents: unknown[]): Promise<unknown> }, seats: string[]) {
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 3 }])
  for (const seat of seats) await dealer.send([{ v: 'draw', from: 'draw', to: `mine:${seat}`, count: 1 }])
}

test.describe('the felt’s arrows follow the screen (K16, #572)', () => {
  test('on the television, no arrow goes against its own direction', async ({ tableOf, host, open }) => {
    const table = await tableOf({ players: 4, counters: [], cards: 16, copies: 1 })
    await laid(await host(table), ['A', 'B', 'C', 'D'])
    const { page } = await open(TV, table.tvUrl)
    await expect(page.locator('[data-kbd^="pile:"]').first()).toBeAttached()
    const { stops, walks } = await walk(page)
    // Not vacuous: a felt with things all round it, and arrows that did move.
    expect(stops).toBeGreaterThanOrEqual(8)
    expect(walks.filter((w) => w.to !== null).length).toBeGreaterThan(stops)
    expect(walks.filter((w) => w.against > 0)).toEqual([])
  })

  test('on a seat across the table, whose felt is turned, no arrow goes against its own direction', async ({ tableOf, host, open, request }) => {
    const table = await tableOf({ players: 4, counters: [], cards: 16, copies: 1 })
    await laid(await host(table), ['A', 'B', 'C', 'D'])
    const seat = await join(request, table, { name: 'Bo', seat: 'B' })
    const { page } = await open(DESK, `${seat.onlineUrl}&lang=sv`)
    await expect(page.locator('[data-kbd^="pile:"]').first()).toBeAttached()
    const { stops, walks } = await walk(page)
    expect(stops).toBeGreaterThanOrEqual(8)
    expect(walks.filter((w) => w.to !== null).length).toBeGreaterThan(stops)
    expect(walks.filter((w) => w.against > 0)).toEqual([])
  })

  test('keeps the felt one tab stop', async ({ tableOf, host, open }) => {
    const table = await tableOf({ players: 4, counters: [], cards: 16, copies: 1 })
    await laid(await host(table), ['A', 'B', 'C', 'D'])
    const { page } = await open(TV, table.tvUrl)
    await expect(page.locator('[data-kbd^="pile:"]').first()).toBeAttached()
    const open_ = await page.locator('[data-kbd^="card:"][tabindex="0"], [data-kbd^="pile:"][tabindex="0"], [data-kbd^="counter:"][tabindex="0"]').count()
    expect(open_).toBe(1)
  })
})

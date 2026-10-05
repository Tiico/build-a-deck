import type { APIRequestContext, Page } from '@playwright/test'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { spelkortDoc } from '../../../server/scripts/spelkort.js'
import { tableOf, type Table } from '../../support/api.js'
import { expect, test, type Fixtures } from '../../support/test.js'

// What stands in the TV's corner — «Starta om» and the help's disc beside it (#482, #684) — covers
// nothing on the table (#875). At 1280 × 800 with eight seats «Starta om» lay over seat E's hand at
// the bottom edge: the corner is placed in the frame's pixels, 16 px from its bottom right, and a
// table with eight seats has a hand in that corner.
//
// Measured on the built app in rectangles, against everything a player reads on the felt: every
// card of every hand, every pile with its name, count and caption, every seat's plate, every zone.

async function played(request: APIRequestContext, host: Fixtures['host'], player: Fixtures['player'], seats: 4 | 8): Promise<Table> {
  const doc = spelkortDoc(seats)
  const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
  const dealer = await host(table)
  await dealer.send([{ v: 'shuffle', pile: 'draw' }])
  await dealer.send([{ v: 'deal', from: 'draw', to: table.seats.map((s) => `hand:${s}`), each: 5 }])
  await dealer.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  await player(table, { name: 'Ada', seat: 'A' })
  return table
}

const covered = (page: Page): Promise<{ drawn: number; covered: string[] }> =>
  page.evaluate(() => {
    const meet = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    }
    const what = (el: HTMLElement) => `${el.className.split(' ')[0]} ${el.dataset['zone'] ?? el.dataset['area'] ?? el.dataset['seatPlate'] ?? (el.closest('.byd-hand') as HTMLElement | null)?.dataset['zone'] ?? ''}`.trim()
    // Wherever they stand: the felt's corner on other screens, the TV's column since #875.
    const corner = [...document.querySelectorAll<HTMLElement>('.byd-felt-corner > *, .byd-tv-corner > *')].filter(shown)
    const things = [...document.querySelectorAll<HTMLElement>('.byd-hand-fan > i, .byd-pile, .byd-pile-count, [data-seat-plate], [data-table] > .byd-zone')].filter(shown)
    return { drawn: corner.length, covered: corner.flatMap((c) => things.filter((x) => meet(c.getBoundingClientRect(), x.getBoundingClientRect())).map((x) => `${c.className.split(' ')[0]} × ${what(x)}`)) }
  })

const CELLS = [
  { width: 1280, height: 800, seats: 4 },
  { width: 1280, height: 800, seats: 8 },
  { width: 1920, height: 1080, seats: 4 },
  { width: 1920, height: 1080, seats: 8 },
] as const

test.describe('the TV’s corner covers nothing on the table (#875)', () => {
  test.use({ locale: 'sv-SE' })

  for (const cell of CELLS)
    test(`TV ${cell.width}, ${cell.seats} seats`, async ({ request, open, host, player }) => {
      const table = await played(request, host, player, cell.seats)
      const { page } = await open({ name: `tv-${cell.width}`, viewport: { width: cell.width, height: cell.height } }, `${table.tvUrl}&lang=sv`)
      await expect(page.locator('.byd-table-restart')).toBeVisible()
      await expect(page.locator('[data-seat-plate]')).toHaveCount(table.seats.length)
      // The camera glides to its frame (#325); read once two readings 300 ms apart agree.
      const where = () => page.locator('.byd-hand-fan > i, [data-seat-plate]').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${Math.round(r.left)},${Math.round(r.top)}` }).join(' '))
      let last = await where()
      for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(300)
        const now = await where()
        if (now === last) break
        last = now
      }
      const got = await covered(page)
      // Not vacuous: «Starta om» and the help's disc are both drawn, and measured.
      expect(got.drawn).toBe(2)
      expect({ at: `${cell.width}, ${cell.seats}`, covered: got.covered }).toEqual({ at: `${cell.width}, ${cell.seats}`, covered: [] })
    })
})

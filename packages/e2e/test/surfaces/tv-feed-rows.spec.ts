import { join } from '../../support/api.js'
import { PHONE, TV } from '../../support/devices.js'
import { expect, test } from '../../support/test.js'

// The TV's «SENAST» (#482 fynd 6): nine lines drawn, the list cut at 211 px so the last one stood
// half out, and the observers' row laid over the ones under it. Nobody scrolls a television from the
// sofa, so the list shows the lines that fit whole and no more.
test.describe('the latest lines on a television (#482)', () => {
  test.use({ viewport: TV.viewport })

  test('shows only whole lines, and nothing lies over them', async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players: 4, cards: 12, copies: 2 })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    const dealer = await host(table)
    for (let i = 0; i < 12; i++) await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1 }])
    const watcher = await join(request, table, { name: 'Tittaren' })
    await open(PHONE, watcher.observeUrl)
    await expect(tv.page.locator('[data-observers]')).toBeVisible()
    await expect(tv.page.locator('.byd-tv-feed li').first()).toBeVisible()
    const measured = await tv.page.evaluate(async () => {
      // The list is fitted by a ResizeObserver, which answers in the next frame's layout and before
      // its painting: the observers' row has just shrunk the feed, so the picture is read as the
      // room will see it, one frame on, and not in the instant between the two.
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
      const feed = document.querySelector('.byd-tv-feed') as HTMLElement
      const box = feed.getBoundingClientRect()
      const watchers = document.querySelector('[data-observers]')!.getBoundingClientRect()
      const shown = [...feed.querySelectorAll<HTMLElement>('li')].filter((li) => getComputedStyle(li).display !== 'none' && li.getBoundingClientRect().height > 0)
      return {
        shown: shown.length,
        cut: shown.filter((li) => li.getBoundingClientRect().bottom > box.bottom + 0.5).length,
        under: shown.filter((li) => { const r = li.getBoundingClientRect(); return r.bottom > watchers.top && r.top < watchers.bottom }).length,
        scrolls: feed.scrollHeight > feed.clientHeight + 1,
      }
    })
    expect(measured.shown).toBeGreaterThan(1)
    expect(measured).toEqual({ shown: measured.shown, cut: 0, under: 0, scrolls: false })
  })

  // Read from the sofa (#482 fynd 6, beslut B 2026-09-27, prototyp 21): what the room looks up for
  // is large — who sits where, how much they hold, and the line that just happened — and the rest
  // of the history is smaller and only three lines long; the whole of it is on every phone.
  test('says who holds what and what just happened large enough for the sofa, and keeps three lines', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 4, cards: 12, copies: 2 })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    const dealer = await host(table)
    for (let i = 0; i < 6; i++) await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1 }])
    await expect(tv.page.locator('.byd-tv-feed li')).not.toHaveCount(0)
    const size = await tv.page.evaluate(() => {
      const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
      const seat = document.querySelector('.byd-tv-seats li')!
      const [name, held] = seat.querySelectorAll(':scope > div > span')
      const lines = [...document.querySelectorAll('.byd-tv-feed li')]
      return {
        heading: px(document.querySelector('[data-tv] h2')),
        name: px(name ?? null),
        held: px(held ?? null),
        last: px(seat.querySelector('small')),
        latest: px(lines[0] ?? null),
        history: px(lines[1] ?? null),
        lines: lines.length,
      }
    })
    expect(size).toEqual({ heading: 15, name: 24, held: 20, last: 16, latest: 20, history: 16, lines: 3 })
  })

  // A full table (beslut 2026-09-27, prototyp 22): the seats are what the room looks up for, so they
  // stand whole. Up to six they keep B's three lines; from seven a seat is one line — its name and
  // what it holds, in the same sizes — and the line of what it last did goes, since the feed under
  // it already says so in the seat's colour.
  for (const [players, lines] of [[6, 3], [8, 1]] as const) {
    test(`stands every one of ${players} seats whole, ${lines === 1 ? 'on one line each' : 'on three lines each'}`, async ({ tableOf, open, host }) => {
      const table = await tableOf({ players, cards: 12, copies: 2 })
      const tv = await open(TV, `${table.tvUrl}&lang=sv`)
      const dealer = await host(table)
      for (let i = 0; i < 4; i++) await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1 }])
      await expect(tv.page.locator('.byd-tv-feed li')).not.toHaveCount(0)
      const seats = await tv.page.evaluate(async () => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        const list = document.querySelector('.byd-tv-seats') as HTMLElement
        const rows = [...list.querySelectorAll<HTMLElement>('li')]
        // Lines of text in a seat: a part that starts below the one before it has ended is a new line;
        // two parts beside each other overlap vertically whatever their baselines do.
        const tops = (li: HTMLElement) => {
          const parts = [...li.querySelectorAll(':scope > div > *')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect())
          return parts.filter((r, i) => i === 0 || r.top >= parts[i - 1]!.bottom - 1).length
        }
        const [name, held] = rows[0]!.querySelectorAll(':scope > div > span')
        return {
          scrolls: list.scrollHeight > list.clientHeight + 1,
          lines: Math.max(...rows.map(tops)),
          name: parseFloat(getComputedStyle(name!).fontSize),
          held: parseFloat(getComputedStyle(held!).fontSize),
        }
      })
      expect(seats).toEqual({ scrolls: false, lines, name: 24, held: 20 })
    })
  }
})

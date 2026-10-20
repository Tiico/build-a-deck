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

  // Read from the sofa (#482 fynd 6, prototyp 21; K26 och #573 beslut C): every word the room reads
  // is at the floor of 24 px — who sits where and how much they hold, on each seat's plate on the
  // felt, and the latest lines — and the history is three lines long; the whole of it is on every phone.
  test('says who holds what and what just happened large enough for the sofa, and keeps three lines', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 4, cards: 12, copies: 2 })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    const dealer = await host(table)
    for (let i = 0; i < 6; i++) await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1 }])
    await expect(tv.page.locator('.byd-tv-feed li')).not.toHaveCount(0)
    const size = await tv.page.evaluate(() => {
      const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
      const plate = document.querySelector('[data-seat-plate]')!
      const lines = [...document.querySelectorAll('.byd-tv-feed li')]
      return {
        heading: px(document.querySelector('[data-tv] h2')),
        name: px(plate.querySelector(':scope > b')),
        held: px(plate.querySelector(':scope > span')),
        latest: px(lines[0] ?? null),
        history: px(lines[1] ?? null),
        lines: lines.length,
      }
    })
    expect(size).toEqual({ heading: 24, name: 24, held: 24, latest: 24, history: 24, lines: 3 })
  })

  // A full table: every seat's plate stands whole on the felt, and a seat at the side stacks its
  // words so that its plate does not reach the piles (#573, beslut C, measured at four seats).
  // Along the top and the bottom a plate is one row. A plate is never cut and never laid over
  // another: it is placed on a free place (#683), so what holds on every machine is that the name
  // is whole and that no two plates meet.
  for (const players of [6, 8] as const) {
    test(`stands every one of ${players} seats whole on its plate`, async ({ tableOf, open, host }) => {
      const table = await tableOf({ players, cards: 12, copies: 2 })
      const tv = await open(TV, `${table.tvUrl}&lang=sv`)
      const dealer = await host(table)
      for (let i = 0; i < 4; i++) await dealer.send([{ v: 'draw', from: 'draw', to: 'discard', count: 1 }])
      await expect(tv.page.locator('[data-seat-plate]')).toHaveCount(players)
      const plates = await tv.page.evaluate(async () => {
        await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
        const felt = document.querySelector('[data-table]')!.getBoundingClientRect()
        const all = [...document.querySelectorAll<HTMLElement>('[data-seat-plate]')]
        const boxes = all.map((p) => p.getBoundingClientRect())
        return all.map((p, at) => {
          const r = boxes[at]!
          const parts = [...p.children].map((c) => c.getBoundingClientRect())
          const lines = parts.filter((b, i) => i === 0 || b.top >= parts[i - 1]!.bottom - 1).length
          const side = p.dataset['edge'] === 'E' || p.dataset['edge'] === 'W'
          const name = p.querySelector(':scope > b > span')!
          const meets = boxes.filter((o, i) => i !== at && r.left < o.right - 1 && o.left < r.right - 1 && r.top < o.bottom - 1 && o.top < r.bottom - 1).length
          return { seat: p.dataset['seatPlate'], inside: r.left >= felt.left && r.right <= felt.right && r.top >= felt.top && r.bottom <= felt.bottom, stacked: side ? lines > 1 : lines <= 2, whole: name.scrollWidth <= name.clientWidth, meets }
        })
      })
      for (const p of plates) expect(p).toEqual({ seat: p.seat, inside: true, stacked: true, whole: true, meets: 0 })
    })
  }
})

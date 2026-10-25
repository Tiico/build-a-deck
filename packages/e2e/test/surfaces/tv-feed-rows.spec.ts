import { join } from '../../support/api.js'
import { PHONE, TV } from '../../support/devices.js'
import type { Page } from '@playwright/test'
import type { Host } from '../../support/host.js'
import { expect, test } from '../../support/test.js'

// The room's television keeps no feed (#1290, beställarens beslut A 2026-10-25): «SENAST» was three
// sentences over two or three lines each beside a card of 190 px (#482 fynd 6), and what the room
// read was the words. The stage holds the latest card large, with its one line under it.
// A card drawn onto the table and turned face up: the line the stage holds up is about it (K8).
async function turnOneUp(page: Page, dealer: Host) {
  await dealer.send([{ v: 'draw', from: 'draw', to: 'table', count: 1 }])
  const card = page.locator('.byd-card[data-component][data-kbd]').first()
  await expect(card).toBeVisible()
  await dealer.send([{ v: 'flip', component: (await card.getAttribute('data-component'))!, face: 'front' }])
}

test.describe('the room’s stage on a television (#1290)', () => {
  test.use({ viewport: TV.viewport })

  // Measured once the cards are drawn (#1125): while they wait the floor carries «Laddar kort».
  test('holds up the latest card with its line, and nothing lies over them', async ({ tableOf, open, host, request }) => {
    const table = await tableOf({ players: 4, cards: 12, copies: 2 })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`, { facesReady: true })
    const dealer = await host(table)
    await turnOneUp(tv.page, dealer)
    const watcher = await join(request, table, { name: 'Tittaren' })
    await open(PHONE, watcher.observeUrl)
    await expect(tv.page.locator('[data-observers]')).toBeVisible()
    await expect(tv.page.locator('.byd-tv-stage figcaption')).toHaveText(/^Bordet vände /)
    await expect(tv.page.locator('.byd-tv-feed')).toHaveCount(0)
    const measured = await tv.page.evaluate(() => {
      const box = (s: string) => document.querySelector(s)!.getBoundingClientRect()
      const meet = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      const card = box('.byd-tv-stage figure > div')
      const line = box('.byd-tv-stage figcaption')
      const column = box('[data-tv] > aside')
      const foot = box('.byd-tv-foot')
      const watchers = box('[data-observers]')
      return {
        whole: card.bottom <= column.bottom && foot.bottom <= column.bottom + 0.5,
        under: [meet(watchers, card), meet(watchers, line), meet(foot, card), meet(foot, line)].filter(Boolean).length,
        width: Math.round(card.width),
        stage: Math.round(column.width),
      }
    })
    expect({ whole: measured.whole, under: measured.under }).toEqual({ whole: true, under: 0 })
    // A four-seat table gives the stage its whole 760 px (`stage.ts`), and the card reads from the sofa.
    expect(measured.stage).toBe(760)
    expect(measured.width * 0.048, `the card is ${measured.width} px`).toBeGreaterThanOrEqual(24)
  })

  // Read from the sofa (#482 fynd 6, prototyp 21; K26 och #573 beslut C): every word the room reads
  // is at the floor of 24 px — who sits where and how much they hold, on each seat's plate on the
  // felt, and the line under the stage's card.
  test('says who holds what and what just happened large enough for the sofa', async ({ tableOf, open, host }) => {
    const table = await tableOf({ players: 4, cards: 12, copies: 2 })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    const dealer = await host(table)
    await turnOneUp(tv.page, dealer)
    await expect(tv.page.locator('.byd-tv-stage figcaption')).toHaveText(/^Bordet vände /)
    const size = await tv.page.evaluate(() => {
      const px = (el: Element | null) => (el ? parseFloat(getComputedStyle(el).fontSize) : null)
      const plate = document.querySelector('[data-seat-plate]')!
      return {
        name: px(plate.querySelector(':scope > b')),
        held: px(plate.querySelector(':scope > span')),
        line: px(document.querySelector('.byd-tv-stage figcaption')),
      }
    })
    expect(size).toEqual({ name: 24, held: 24, line: 24 })
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

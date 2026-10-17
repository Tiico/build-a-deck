import { expect, test } from '../../support/test.js'

// Every seat on the picker stands inside the page's own margin (#979). The east and west pills
// hang off the felt by `--byd-seat-hang-x`, and a table whose edges are shared draws the wider
// felt (#42) — 260 px plus the two overhangs is 320 px, the whole of the smallest phone the
// product promises, so with five seats or more the west pill lay against the screen's left edge
// with nothing between it and the glass, and the east one against the right.
//
// What is measured is every pill's box in the built app against the page's padding, read from
// the page rather than written down here, so the margin is whatever the page's margin is. And
// the pill stays a target a thumb can hit (UX-KONTROLLER: träffytor) however the felt is fitted.
const TARGET = 44

type Pill = { seat: string; edge: string; left: number; right: number; top: number; bottom: number }

for (const [width, height] of [[320, 568], [390, 844]] as const) {
  for (const players of [4, 5, 6, 7, 8]) {
    test(`every seat stands inside the page's margin at ${width} × ${height}, ${players} seats`, async ({ tableOf, open }) => {
      const table = await tableOf({ players })
      const { page } = await open({ name: 'phone', viewport: { width, height }, hasTouch: true, isMobile: true }, `/${table.code}?lang=sv`)
      await expect(page.locator('.byd-join-table button')).toHaveCount(players)
      const { margin, pills } = await page.evaluate(() => {
        const main = getComputedStyle(document.querySelector('.byd-join')!)
        const pills = [...document.querySelectorAll<HTMLElement>('.byd-join-table button')].map((b) => {
          const r = b.getBoundingClientRect()
          return { seat: b.dataset['seat'] ?? '?', edge: b.dataset['edge'] ?? '', left: r.left, right: r.right, top: r.top, bottom: r.bottom }
        })
        return { margin: { left: parseFloat(main.paddingLeft), right: parseFloat(main.paddingRight) }, pills }
      })
      const out = pills
        .filter((p) => p.left < margin.left - 0.5 || p.right > width - margin.right + 0.5)
        .map((p) => `${p.seat} ${p.edge} ${Math.round(p.left)}–${Math.round(p.right)}`)
      expect(out, `pills outside ${margin.left}–${width - margin.right}`).toEqual([])
      const small = pills.filter((p) => p.right - p.left < TARGET || p.bottom - p.top < TARGET).map((p) => p.seat)
      expect(small, 'every seat a thumb-sized target').toEqual([])
    })
  }
}

// The felt is fitted to the phone by the same arithmetic it is built from, and not by letting the
// pills hang further over it. So at 320 px the long names that fill every pill to its cap still
// keep each pill off its neighbours, a north or south pill along its own edge of the felt (#750),
// and every pill inside the page's margin.
const sixty = (seat: string) => `${seat} Åke «Örnen» Östlund & söner, Bartholomew Longbottom d.y.`.padEnd(60, '!').slice(0, 60)
for (const players of [5, 6, 8]) {
  test(`a ${players}-seat table of long names keeps its pills apart, on the felt and inside the margin at 320 × 568`, async ({ tableOf, open, host }) => {
    const table = await tableOf({ players })
    const dealer = await host(table)
    await dealer.send(table.seats.map((seat) => ({ v: 'seat.claim', seat, name: sixty(seat) }) as never))
    const { page } = await open({ name: 'phone', viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true }, `/${table.code}?lang=sv`)
    await expect(page.locator('.byd-join-table button[aria-disabled="true"]')).toHaveCount(players)
    const { margin, felt, pills } = await page.evaluate(() => {
      const main = getComputedStyle(document.querySelector('.byd-join')!)
      const f = document.querySelector('.byd-join-table')!.getBoundingClientRect()
      const pills = [...document.querySelectorAll<HTMLElement>('.byd-join-table button')].map((b) => {
        const r = b.getBoundingClientRect()
        return { seat: b.dataset['seat'] ?? '?', edge: b.dataset['edge'] ?? '', left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      })
      return { margin: { left: parseFloat(main.paddingLeft), right: parseFloat(main.paddingRight) }, felt: { left: f.left, right: f.right }, pills }
    })
    const at = (p: Pill) => `${p.seat} ${p.edge} ${Math.round(p.left)}–${Math.round(p.right)}`
    expect(pills.filter((p) => p.left < margin.left - 0.5 || p.right > 320 - margin.right + 0.5).map(at), 'inside the margin').toEqual([])
    expect(pills.filter((p) => (p.edge === 'N' || p.edge === 'S') && (p.left < felt.left - 0.5 || p.right > felt.right + 0.5)).map(at), 'along the felt').toEqual([])
    const stacked = pills.flatMap((a, i) =>
      pills.slice(i + 1).filter((b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom).map((b) => `${a.seat}×${b.seat}`),
    )
    expect(stacked, 'no pill over another').toEqual([])
  })
}

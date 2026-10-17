// PROTOTYP #766 — kastas. TV:n med åtta platser och 25 kort på A:s hand; bara på prototypgrenen.
import { TV } from '../support/devices.js'
import { expect, test } from '../support/test.js'

const OUT = new URL('../../../docs/ux-audits/2026-10-17-solfjadern/prototyper/766/', import.meta.url).pathname

// Each variant re-lays the backs of every hand on the TV. `n` backs, `k` from the middle.
const LAY: Record<string, string> = {
  idag: '',
  A: `(i, n) => { const k = i - (n - 1) / 2; const per = n > 1 ? Math.min(9, 44 / (n - 1)) : 0; return 'rotate(' + (k * per) + 'deg)' }`,
  B: `(i, n, w) => { const k = i - (n - 1) / 2; const step = Math.min(w * 0.18, (w * 2.2) / Math.max(1, n - 1)); return 'translateX(' + (k * step) + 'px)' }`,
  C: `(i, n) => { if (i >= 5) return 'scale(0)'; const m = Math.min(n, 5); const k = i - (m - 1) / 2; return 'rotate(' + (k * 9) + 'deg)' }`,
}

for (const v of Object.keys(LAY)) {
  test(`hand ${v}`, async ({ tableOf, host, open }) => {
    test.setTimeout(240_000)
    const table = await tableOf({ players: 8, counters: [{ name: 'Guld', start: 0 }], cards: 40, copies: 1 })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 25 }, { v: 'draw', from: 'draw', to: 'hand:B', count: 3 }])
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    await expect(tv.page.locator('[data-zone="hand:A"] .byd-back').first()).toBeAttached()
    await tv.page.waitForTimeout(1200)
    if (LAY[v]) await tv.page.evaluate(`(() => { const lay = ${LAY[v]}; for (const hand of document.querySelectorAll('.byd-hand')) { const backs = [...hand.querySelectorAll('.byd-back')]; backs.forEach((b, i) => { b.style.transform = lay(i, backs.length, b.offsetWidth) }) } })()`)
    await tv.page.waitForTimeout(200)
    const m = await tv.page.evaluate(() => {
      const wood = document.querySelector('.byd-table-wood') ?? document.querySelector('[data-table]')!
      const f = wood.getBoundingClientRect()
      const out: Record<string, number> = {}
      for (const hand of document.querySelectorAll<HTMLElement>('.byd-hand')) {
        const bs = [...hand.querySelectorAll('.byd-back')].map((b) => b.getBoundingClientRect()).filter((b) => b.width > 0)
        if (!bs.length) continue
        const top = Math.min(...bs.map((b) => b.top)), bottom = Math.max(...bs.map((b) => b.bottom))
        out[hand.dataset.zone!] = Math.round(Math.max(0, f.top - top, bottom - f.bottom))
      }
      return out
    })
    console.log('OUTSIDE', v, JSON.stringify(m))
    await tv.page.screenshot({ path: `${OUT}bilder/${v}.png` })
    const a = (await tv.page.locator('[data-zone="hand:A"]').boundingBox())!
    await tv.page.screenshot({ path: `${OUT}bilder/${v}-nara.png`, clip: { x: a.x - 260, y: a.y - 200, width: 520, height: 1080 - (a.y - 200) } })
  })
}

// PROTOTYP #767 — kastas. Telefonen med 25 kort på handen; bara på prototypgrenen.
import { PHONE } from '../support/devices.js'
import { expect, test } from '../support/test.js'

const OUT = new URL('../../../docs/ux-audits/2026-10-17-handen/prototyper/767/', import.meta.url).pathname
const CSS = `
  .proto-all { margin-left: auto; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid #3a4050; background: #1b1e26; color: #e8eaf0; font: 700 13px system-ui, sans-serif; }
  .proto-head { display: flex; align-items: center; gap: 8px; }
  .proto-sheet { position: fixed; inset: 0; z-index: 50; background: #14161c; padding: 16px; overflow: auto; }
  .proto-sheet h2 { display: flex; align-items: center; margin: 0 0 12px; font: 800 20px system-ui, sans-serif; color: #e8eaf0; }
  .proto-sheet h2 button { margin-left: auto; min-height: 40px; padding: 0 14px; border-radius: 999px; border: 1px solid #3a4050; background: #1b1e26; color: #e8eaf0; font: 700 13px system-ui, sans-serif; }
  .proto-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .proto-grid > * { width: auto !important; height: auto !important; aspect-ratio: 63 / 88; min-width: 0 !important; flex: none !important; font-size: 11px !important; }
  .proto-where { display: flex; align-items: center; gap: 10px; margin: 6px 0 0; font: 600 13px system-ui, sans-serif; color: #9aa3b8; }
  .proto-where i { flex: 1; height: 4px; border-radius: 2px; background: #2a2f3c; position: relative; }
  .proto-where i::after { content: ''; position: absolute; top: 0; bottom: 0; left: 88%; width: 12%; border-radius: 2px; background: #7dd3a0; }
  .proto-small .byd-strip-card { width: 78px !important; min-width: 78px !important; height: 109px !important; font-size: 10px !important; }
`
test.use({ locale: 'sv-SE' })

for (const v of ['idag', 'A', 'A-oppen', 'B', 'C']) {
  test(`hand ${v}`, async ({ tableOf, host, player }) => {
    test.setTimeout(240_000)
    const table = await tableOf({ players: 4, counters: [], cards: 40, copies: 1 })
    const ada = await player(table, { name: 'Ada', seat: 'A', device: PHONE })
    const dealer = await host(table)
    await dealer.send([{ v: 'draw', from: 'draw', to: 'hand:A', count: 25 }])
    await expect(ada.page.locator('[data-hand-card]')).toHaveCount(25)
    await ada.page.waitForTimeout(800)
    await ada.page.addStyleTag({ content: CSS })
    await ada.page.evaluate(`(() => {
      const v = ${JSON.stringify(v)}
      const strip = document.querySelector('.byd-strip')
      const head = [...document.querySelectorAll('h1, h2')].find((h) => /kort|cards/i.test(h.textContent))
      if (v.startsWith('A')) {
        const row = document.createElement('div'); row.className = 'proto-head'; head.before(row); row.append(head)
        const b = document.createElement('button'); b.className = 'proto-all'; b.textContent = 'Visa alla · 25'; row.append(b)
        if (v === 'A-oppen') {
          const sheet = document.createElement('div'); sheet.className = 'proto-sheet'
          sheet.innerHTML = '<h2>Dina 25 kort<button>Stäng</button></h2>'
          const grid = document.createElement('div'); grid.className = 'proto-grid'
          for (const c of strip.querySelectorAll('.byd-strip-card')) grid.append(c.cloneNode(true))
          sheet.append(grid); document.body.append(sheet)
        }
      }
      if (v === 'B') { const p = document.createElement('p'); p.className = 'proto-where'; p.innerHTML = '<span>23–25 av 25</span><i></i>'; strip.after(p) }
      if (v === 'C') strip.classList.add('proto-small')
    })()`)
    await ada.page.waitForTimeout(300)
    await ada.page.screenshot({ path: `${OUT}bilder/${v}.png` })
  })
}

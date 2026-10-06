// PROTOTYP #711 — kastas. Bord-flikens kolumn: var «＋ Yta / Hög / …» står; bara på prototypgrenen.
import { logIn, makeProject } from '../support/api.js'
import { expect, test } from '../support/test.js'

test.use({ locale: 'sv-SE' })
const OUT = new URL('../../../docs/ux-audits/2026-10-06-kolumnknappar/prototyper/711/', import.meta.url).pathname

const CSS = `
  .proto-sticky { position: sticky; bottom: 0; z-index: 2; margin: 0 -4px 0 0; padding: 12px 4px 12px 0; background: linear-gradient(to bottom, transparent, #1f2229 12px); border-top: 1px solid #2f333d; }
  .proto-head-adds { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 4px; }
  .proto-head-adds button { min-height: 36px; border: 1px solid #2f333d; border-radius: 8px; padding: 0 10px; background: #1b1d23; color: #fff; font: 700 12px system-ui, sans-serif; }
  .proto-add { position: relative; }
  .proto-add > button { width: 100%; min-height: 44px; border: 1px solid #2f333d; border-radius: 8px; background: #1b1d23; color: #fff; font: 700 13px system-ui, sans-serif; text-align: left; padding: 0 12px; }
  .proto-add-menu { position: absolute; left: 0; right: 0; top: calc(100% + 4px); z-index: 5; display: grid; padding: 4px; border-radius: 10px; background: #262a35; box-shadow: 0 12px 30px rgba(0,0,0,.5); }
  .proto-add-menu button { min-height: 44px; border: 0; border-radius: 6px; background: none; color: #e8eaf0; font: 600 13px system-ui, sans-serif; text-align: left; padding: 0 12px; }
  .proto-add-menu small { color: #9aa3b8; font-weight: 400; margin-left: 6px; }
  .proto-add-menu hr { border: 0; border-top: 1px solid #3a4050; margin: 4px 0; width: 100%; }
`

for (const size of [{ width: 1024, height: 640 }, { width: 1024, height: 768 }]) {
  test(`kolumnknappar ${size.width}x${size.height}`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(size)
    await logIn(page.request)
    for (const v of ['idag', 'A', 'B', 'C']) {
      const project = await makeProject(page.request, { name: "Sal's Saloon", players: 4 })
      await page.goto(project.editorUrl)
      await expect(page.getByText("Sal's Saloon").first()).toBeVisible()
      await page.locator('#byd-editor-tab-tables').click()
      await expect(page.locator('.byd-setup-tools')).toBeAttached()
      await page.waitForTimeout(800)
      await page.addStyleTag({ content: CSS })
      await page.evaluate(`(() => {
        const v = ${JSON.stringify(v)}
        const tools = document.querySelector('.byd-setup-tools')
        const side = document.querySelector('.byd-setup-side')
        const heading = (text) => [...side.querySelectorAll('*')].find((e) => e.children.length === 0 && e.textContent.trim().toLowerCase() === text)
        if (v === 'A') { tools.classList.add('proto-sticky'); let e = side; let bg = 'transparent'; while (e && (bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)')) { bg = getComputedStyle(e).backgroundColor; e = e.parentElement } tools.style.background = bg }
        if (v === 'B') {
          const [area, pile, seatArea, seatCounters] = tools.querySelectorAll('button')
          const table = heading('på bordet'); const seats = heading('vid platserna')
          const row = (bs) => { const d = document.createElement('div'); d.className = 'proto-head-adds'; for (const b of bs) d.append(b); return d }
          table.after(row([area, pile])); seats.after(row([seatArea, seatCounters]))
          tools.remove()
        }
        if (v === 'C') {
          const box = document.createElement('div'); box.className = 'proto-add'
          box.innerHTML = '<button aria-expanded="true">＋ Lägg till zon ▾</button><div class="proto-add-menu"><button>Yta</button><button>Hög</button><hr><button>Yta per plats<small>en vid varje plats</small></button><button>Räknarzon per plats<small>en vid varje plats</small></button></div>'
          const table = heading('på bordet')
          ;(table.closest('section, div') ?? table).before(box)
          tools.remove()
        }
      })()`)
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${OUT}bilder/${v}-${size.width}x${size.height}.png` })
    }
  })
}

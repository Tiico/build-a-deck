// PROTOTYP #718 — kastas. Vad TV:n visar när «Starta spelet» trycks; bara på prototypgrenen.
import type { ProjectDoc } from '@byd/server'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
import { tableOf } from '../support/api.js'
import { TV } from '../support/devices.js'
import { gameDoc } from '../support/game.js'
import { expect, test } from '../support/test.js'

const OUT = new URL('../../../docs/ux-audits/2026-10-06-starten/prototyper/718/', import.meta.url).pathname

function saloon(): ProjectDoc {
  const doc = gameDoc({ name: "Sal's Saloon", players: 4, cards: 40 })
  return { ...doc, setup: { ...doc.setup, zones: doc.setup.zones.map((z) => (z.id === doc.setup.deckZone ? { ...z, actions: [{ id: 'start', label: 'Blanda leken', when: 'both' as const, steps: [{ v: 'shuffle' as const }] }] } : z)) } }
}

const BIG = `
  .byd-table-frame[data-mode='tv'] .byd-pile .byd-pile-fan-card { animation: proto-fan 1200ms cubic-bezier(0.32, 0.72, 0.3, 1) both; animation-delay: -420ms !important; animation-play-state: paused !important; }
  @keyframes proto-fan { 0% { transform: none; } 35% { transform: translateX(calc(var(--fan-out) * 2.6)) rotate(calc(var(--fan-turn) * 2)); } 100% { transform: none; } }
`
const PEAK = `
  .byd-table-frame[data-mode='tv'] .byd-pile .byd-pile-fan-card { animation-delay: -190ms !important; animation-play-state: paused !important; }
`
const SAID = `
  .proto-said { position: absolute; left: 50%; top: calc(100% + 46px); translate: -50% 0; white-space: nowrap; padding: 6px 14px; border-radius: 999px; background: #e8eaf0; color: #0d0f14; font: 800 18px system-ui, sans-serif; box-shadow: 0 6px 18px rgba(0,0,0,.5); }
`

for (const v of ['idag', 'A', 'B', 'C']) {
  test(`starten på TV:n ${v}`, async ({ request, open, player }) => {
    test.setTimeout(240_000)
    const doc = saloon()
    const table = await tableOf(request, setupFromProject(doc), deckFromProject(doc))
    for (const [i, seat] of ['A', 'B', 'C', 'D'].entries()) await player(table, { name: ['Ada', 'Bo', 'Cy', 'Di'][i]!, seat })
    const tv = await open(TV, `${table.tvUrl}&lang=sv`)
    const tile = tv.page.locator('[data-table-start]')
    await expect(tile).toBeVisible()
    await tv.page.waitForTimeout(1200)
    if (v === 'idag') await tv.page.screenshot({ path: `${OUT}bilder/fore.png` })
    await tv.page.addStyleTag({ content: (v === 'A' || v === 'C' ? BIG : PEAK) + SAID })
    await tile.click()
    await expect(tv.page.locator('.byd-pile-fan-card').first()).toBeAttached()
    if (v === 'B' || v === 'C') await tv.page.evaluate(`(() => { const pile = document.querySelector('.byd-pile[data-shuffling]'); const said = document.createElement('div'); said.className = 'proto-said'; said.textContent = 'Draghög blandad'; pile.append(said) })()`)
    await tv.page.waitForTimeout(150)
    await tv.page.screenshot({ path: `${OUT}bilder/${v}.png` })
    const box = await tv.page.locator('.byd-pile[data-shuffling]').boundingBox()
    await tv.page.screenshot({ path: `${OUT}bilder/${v}-nara.png`, clip: { x: box!.x - 200, y: box!.y - 120, width: 520, height: 360 } })
  })
}

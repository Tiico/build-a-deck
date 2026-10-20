// Screenshots of the prototype page itself, served over http, for the issue comment.
//   node proto-shots.mjs http://127.0.0.1:8789 <ut-katalog>
import { chromium } from '@playwright/test'
import { join } from 'node:path'
const [BASE, OUT] = process.argv.slice(2)
const b = await chromium.launch()
const page = await b.newPage({ viewport: { width: 1440, height: 1000 } })
for (const [v, yta, pl] of [['c', 'online-1280', '4'], ['d', 'online-1280', '4'], ['c', 'online-1280', '8'], ['d', 'online-1280', '8']]) {
  await page.goto(`${BASE}/01-hogens-namn.html?v=${v}&yta=${yta}&platser=${pl}&lage=pending`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: join(OUT, `proto-${v}-${yta}-${pl}.png`) })
}
await page.goto(`${BASE}/01-hogens-namn.html?v=c`)
await page.waitForLoadState('networkidle')
await page.locator('.matris').screenshot({ path: join(OUT, 'proto-matris.png') })
await b.close()

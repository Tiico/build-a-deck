// PROTOTYP 2026-10-26 — skärmbilder ur prototypen med Playwrights Chromium, och måttraden som text.
//   (cd .. && python3 -m http.server 8826 --bind 127.0.0.1) &
//   PLAYWRIGHT=<sökväg till playwright> node matning/shoot.mjs [bas-url]
// Skriver ../bilder/<variant>-<lek>-<bredd>[-tillstånd].png och måtten på stdout.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright')
const base = process.argv[2] ?? 'http://127.0.0.1:8826/index.html'

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1 })
const shots = []
for (const v of ['nu', 'A', 'B', 'C']) for (const w of [1280, 1024]) shots.push({ v, w, lek: 'prov' })
for (const v of ['nu', 'A', 'B', 'C']) shots.push({ v, w: 1280, lek: 'tat' })
shots.push({ v: 'A', w: 1280, lek: 'prov', state: 'dorr' }, { v: 'B', w: 1280, lek: 'prov', state: 'dorr' }, { v: 'C', w: 1280, lek: 'prov', state: 'kant' }, { v: 'A', w: 1280, lek: 'prov', state: 'rullad' }, { v: 'nu', w: 1280, lek: 'prov', state: 'rullad' })
for (const s of shots) {
  const name = `${s.v}-${s.lek}-${s.w}${s.state ? `-${s.state}` : ''}`
  await page.goto(`${base}?v=${s.v}&w=${s.w}&lek=${s.lek}&font=mac`)
  await page.waitForFunction(() => document.body.dataset.klar === 'allt', null, { timeout: 90000 })
  await page.addStyleTag({ content: '.flytande { display: none !important; }' })
  if (s.state === 'dorr') await page.click('#dorr')
  if (s.state === 'kant') {
    await page.focus('.kant')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
  }
  if (s.state === 'rullad') await page.evaluate(() => { document.getElementById('scroll').scrollLeft = 600 })
  await page.waitForTimeout(200)
  const box = await page.locator('#fonster').boundingBox()
  await page.screenshot({ path: join(here, '..', 'bilder', `${name}.png`), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 560) } })
  const matt = await page.locator('#matt').innerText()
  console.log(name, '—', matt.replace(/\n/g, ' '))
}
await browser.close()
process.exit(0)

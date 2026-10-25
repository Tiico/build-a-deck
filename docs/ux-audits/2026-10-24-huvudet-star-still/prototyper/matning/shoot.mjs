// PROTOTYP #1250 — skärmbilder och mätmatrisen ur prototypen, med Playwrights Chromium.
//   (cd .. && python3 -m http.server 8750 --bind 127.0.0.1) &
//   PLAYWRIGHT=<sökväg till playwright> node matning/shoot.mjs [bas-url]
// Skriver ../bilder/<variant>-<bredd>-<typsnitt>.png (före och efter i samma bild) och skriver
// matrisen som text på stdout.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT ?? 'playwright')
const base = process.argv[2] ?? 'http://127.0.0.1:8750/index.html'
const only = process.env.ONLY

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const shots = []
for (const v of ['A', 'B', 'C']) for (const w of [1440, 1280, 1024]) for (const font of ['bred', 'mac']) shots.push({ v, w, font })
let printed = !!process.env.NOMATRIS
for (const s of shots) {
  const bord = process.env.BORD === "med" ? "med" : "utan"
  const name = `${s.v}-${s.w}-${s.font}${bord === "med" ? "-bord" : ""}`
  if (only && !name.startsWith(only)) continue
  await page.goto(`${base}?v=${s.v}&w=${s.w}&font=${s.font}&lang=sv&bord=${bord}&namn=skogen`)
  await page.waitForSelector('body[data-klar="allt"]', { timeout: 60000 })
  await page.addStyleTag({ content: '.flytande { display: none !important; }' })
  const scen = page.locator('.scen')
  const fore = await page.locator('#fore').boundingBox()
  const efter = await page.locator('#efter').boundingBox()
  await page.screenshot({ path: join(here, '..', 'bilder', `${name}.png`), clip: { x: fore.x - 8, y: fore.y - 8, width: Math.max(fore.width, efter.width) + 16, height: efter.y + efter.height - fore.y + 16 }, fullPage: true })
  if (!printed) {
    printed = true
    const text = await page.locator('#matris').evaluate((t) => [...t.rows].map((r) => [...r.cells].map((c) => c.innerText.replace(/\n/g, ' · ')).join(' | ')).join('\n'))
    console.log(text)
    const box = await page.locator('#matris').boundingBox()
    await page.screenshot({ path: join(here, '..', 'bilder', 'matris.png'), clip: { x: box.x - 8, y: box.y - 30, width: box.width + 16, height: box.height + 38 }, fullPage: true })
  }
  const rows = await page.locator('.radnamn').evaluateAll((els) => els.map((e) => e.innerText.replace(/\n/g, ' · ')))
  console.log(name, '\n  ' + rows.join('\n  '))
}
await browser.close()
process.exit(0)

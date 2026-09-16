// PROTOTYP — tar varje variant vid 1024, 1280 och 1440, de bredder editorn granskas i
// (UX-KONTROLLER, L12). Kör Vite från den här arbetskopian först:
//
//   PORT=5199 pnpm --filter @byd/web dev
//   node packages/web/src/editor/prototype/ux16/skarmbilder.mjs
//
// Bilderna hamnar i docs/ux-audits/2026-09-16/prototypes-ux16/ och pekas ut från issuerna.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ORIGIN = process.env.ORIGIN ?? 'http://localhost:5199'
const UT = join(process.cwd(), 'docs/ux-audits/2026-09-16/prototypes-ux16')
const BREDDER = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
]

const bilder = []
const push = (issue, fynd, variant, extra, namn) => bilder.push({ issue, fynd, variant, extra, namn })

for (const v of ['A', 'B', 'C']) {
  push(132, 'skala', v, {}, `skala-${v}`)
  for (const yta of ['vagg', 'symboler', 'data']) push(128, 'krona', v, { yta }, `krona-${yta}-${v}`)
  push(129, 'grupper', v, {}, `grupper-${v}`)
  push(131, 'regler', v, {}, `regler-tomt-${v}`)
  push(131, 'regler', v, { skriven: '1' }, `regler-skriven-${v}`)
}
// Lådorna i B och skenans flyout i C är en egen bild: de är själva mekanismen.
push(128, 'krona', 'B', { yta: 'vagg', lada: 'ogon' }, 'krona-vagg-B-lada-oppen')
push(128, 'krona', 'B', { yta: 'data', lada: 'filter' }, 'krona-data-B-lada-oppen')
push(128, 'krona', 'C', { yta: 'data', lada: 'filter' }, 'krona-data-C-flyout')
push(129, 'grupper', 'B', {}, 'grupper-B-overflod')
push(129, 'grupper', 'A', { props: '0' }, 'grupper-A-egenskaper-fallda')

mkdirSync(UT, { recursive: true })
const browser = await chromium.launch()
const fel = []
const matt = []
for (const [w, h] of BREDDER) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })
  page.on('console', (m) => m.type() === 'error' && fel.push(`${w}: ${m.text()}`))
  page.on('pageerror', (e) => fel.push(`${w}: ${e.message}`))
  for (const b of bilder) {
    const url = new URL('/ux16', ORIGIN)
    url.searchParams.set('fynd', b.fynd)
    url.searchParams.set('variant', b.variant)
    url.searchParams.set('shot', '1')
    for (const [k, val] of Object.entries(b.extra)) url.searchParams.set(k, val)
    await page.goto(url.href, { waitUntil: 'networkidle' })
    if (b.namn === 'grupper-B-overflod') await page.getByRole('button', { name: /^Alla \d+/ }).click()
    await page.waitForTimeout(140)
    const rad = await page.locator('.ux16-meter').first().innerText()
    matt.push({ bild: `${b.namn}-${w}`, matt: rad.replace(/\s+/g, ' ').trim() })
    await page.screenshot({ path: join(UT, `ux16p-${b.namn}-${w}.png`) })
  }
  await page.close()
}
await browser.close()
writeFileSync(join(UT, 'matt.json'), JSON.stringify(matt, null, 2))
console.log(`${bilder.length * BREDDER.length} bilder i ${UT}`)
if (fel.length) console.log('KONSOLFEL:\n' + [...new Set(fel)].join('\n'))
else console.log('inga konsolfel')

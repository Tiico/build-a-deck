import { createRequire } from 'node:module'
const require = createRequire(new URL('../../../../packages/web/package.json', import.meta.url))
const { chromium } = require('playwright')
const out = process.argv[2]
const list = process.argv.slice(3)
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
for (const spec of list) {
  const cut = spec.indexOf('='); const name = spec.slice(0, cut); const query = spec.slice(cut + 1)
  await page.goto(`http://127.0.0.1:8731/index.html?${query.replaceAll(',', '&')}`)
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/${name}.png` })
  console.log('shot', name)
}
console.log('errors', JSON.stringify(errors))
await browser.close()
process.exit(0)

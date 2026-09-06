// Screenshots for issues and notes: `pnpm --filter @byd/render shot <url> <out.png> [width] [height] [waitMs]`.
import { chromium } from 'playwright'

const [url, out, w = '1400', h = '900', wait = '2500'] = process.argv.slice(2)
if (!url || !out) {
  console.error('usage: shot <url> <out.png> [width] [height] [waitMs]')
  process.exit(1)
}
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 })
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(Number(wait))
await page.screenshot({ path: out })
await browser.close()
console.log(JSON.stringify({ msg: 'shot', url, out }))

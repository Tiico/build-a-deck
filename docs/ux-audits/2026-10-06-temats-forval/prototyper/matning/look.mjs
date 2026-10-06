// Första titten: /new som det står, vid ett mått, med en helsidesbild och lådornas lägen.
//   node look.mjs 1280 800 [ut.png] [utloggad]
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const [w, h] = [Number(process.argv[2] ?? 1280), Number(process.argv[3] ?? 800)]
const out = process.argv[4] ?? join(HERE, 'shots', `look-${w}.png`)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'sv-SE' })
if (process.argv[5] !== 'utloggad') await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
const page = await ctx.newPage()
page.on('request', (r) => { if (/google|gstatic/.test(r.url())) console.log('REQ', r.url()) })
await page.goto(links.origin + '/new', { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
const boxes = await page.evaluate(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
  return { doc: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], handoff: r('.byd-wizard-handoff'), themes: r('.byd-wizard-themes'), look: r('.byd-wizard-look'), preview: r('.byd-wizard-preview'), side: r('.byd-wizard-side'), main: r('.byd-wizard-main'), create: r('.byd-wizard-primary'), header: r('.byd-wizard > header') }
})
console.log(JSON.stringify(boxes))
await page.screenshot({ path: out, fullPage: true })
await browser.close()

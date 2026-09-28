// PROTOTYPE — throwaway (#508). node measure.mjs <links.json> <outdir> <seats>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const [linksFile, out, seats = '4'] = process.argv.slice(2)
const links = JSON.parse(readFileSync(linksFile, 'utf8'))
mkdirSync(out, { recursive: true })
const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1280, h: 800 },
]
const VARIANTS = ['I dag', 'A', 'B', 'C']
const BODY = 0.048 // 8,5 pt brödtext per px kortbredd (K26)

const browser = await chromium.launch()
const results = []
for (const size of SIZES)
  for (const variant of VARIANTS) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, locale: 'sv-SE' })
    const url = variant === 'I dag' ? links.tv : `${links.tv}&variant=${variant}`
    await page.goto(url)
    await page.waitForSelector('[data-tv] [data-table]')
    const settle = () =>
      page.waitForFunction(() => {
        const imgs = [...document.querySelectorAll('img.byd-texture')]
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)
      }, null, { timeout: 30_000 })
    await settle()
    await page.waitForTimeout(400)
    const read = () =>
      page.evaluate(() => {
        const r = (el) => el && el.getBoundingClientRect()
        const insp = r(document.querySelector('.byd-tv-inspect > div'))
        const felt = [...document.querySelectorAll('[data-tv] > main img.byd-texture')].map(r).filter((b) => b.width > 0)
        const short = felt.map((b) => Math.min(b.width, b.height)).sort((a, b) => a - b)
        const aside = r(document.querySelector('[data-tv] > aside'))
        const seats = [...document.querySelectorAll('.byd-tv-seats li')].map(r)
        const feed = [...document.querySelectorAll('.byd-tv-feed li')].filter((li) => !li.hidden).length
        const seatsBox = r(document.querySelector('.byd-tv-seats'))
        const spot = r(document.querySelector('[data-proto508-card]'))
        return {
          column: Math.round(aside.width),
          inspect: insp ? Math.round(insp.width) : null,
          feltShortMin: Math.round(short[0] ?? 0),
          feltShortMedian: Math.round(short[Math.floor(short.length / 2)] ?? 0),
          seatsWhole: seats.filter((b) => b.bottom <= seatsBox.bottom + 0.5).length,
          seats: seats.length,
          feedLines: feed,
          spot: spot ? Math.round(spot.width) : null,
        }
      })
    const tag = `${variant === 'I dag' ? 'idag' : variant}-${seats}p-${size.w}x${size.h}`
    const rest = await read()
    await page.screenshot({ path: `${out}/${tag}-vila.png` })
    const row = { variant, seats: Number(seats), size: `${size.w}×${size.h}`, ...rest, inspectBody: rest.inspect && +(rest.inspect * BODY).toFixed(1) }
    if (variant === 'B' || variant === 'C') {
      await page.locator('.p508-list button').first().click()
      await page.waitForSelector('[data-proto508-card] img.byd-texture')
      await settle()
      await page.waitForTimeout(300)
      const called = await read()
      await page.screenshot({ path: `${out}/${tag}-visad.png` })
      row.spot = called.spot
      row.spotBody = +(called.spot * BODY).toFixed(1)
      await page.keyboard.press('Escape')
    }
    if (variant === 'C') {
      await page.locator('.p508-play').click()
      await page.waitForSelector('[data-proto508-card]', { timeout: 10_000 })
      await settle()
      await page.waitForTimeout(300)
      await page.screenshot({ path: `${out}/${tag}-spelat.png` })
      row.autoShown = true
    }
    results.push(row)
    console.log(JSON.stringify(row))
    await page.close()
  }
await browser.close()
writeFileSync(`${out}/matt-${seats}p.json`, JSON.stringify(results, null, 2))

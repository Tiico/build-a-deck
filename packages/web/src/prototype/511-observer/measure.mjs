// PROTOTYPE — throwaway (#511). node measure.mjs <links.json> <outdir>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const [linksFile, out] = process.argv.slice(2)
const links = JSON.parse(readFileSync(linksFile, 'utf8'))
mkdirSync(out, { recursive: true })
const SIZES = [
  { w: 1280, h: 800 },
  { w: 1920, h: 1080 },
]
const BODY = 0.048
const joined = await fetch(`${links.api}/rooms/${links.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Eva' }) })
const { token } = await joined.json()
const base = `${links.web}/observe?session=${links.session}&name=Eva&token=${token}&code=${links.code}&server=${encodeURIComponent(links.api.replace('http', 'ws'))}`
const browser = await chromium.launch()
const results = []
for (const size of SIZES)
  for (const variant of ['I dag', 'A', 'B', 'C']) {
    const page = await browser.newPage({ viewport: { width: size.w, height: size.h }, locale: 'sv-SE' })
    await page.goto(variant === 'I dag' ? base : `${base}&variant=${variant}`)
    await page.waitForSelector('[data-tv] [data-table]', { state: 'attached' })
    const settle = () =>
      page.waitForFunction(() => {
        const imgs = [...document.querySelectorAll('img.byd-texture')]
        return imgs.length > 0 && imgs.every((i) => i.complete && i.naturalWidth > 0)
      }, null, { timeout: 30_000 })
    await settle()
    await page.waitForTimeout(400)
    const felt = await page.evaluate(() => {
      const hands = [...document.querySelectorAll('[data-tv] > main [data-zone^="hand:"] img.byd-texture, [data-tv] > main .byd-hand img.byd-texture')]
      const all = [...document.querySelectorAll('[data-tv] > main img.byd-texture')]
      const short = (els) => els.map((i) => i.getBoundingClientRect()).filter((b) => b.width > 0).map((b) => Math.min(b.width, b.height)).sort((a, b) => a - b)
      return { handShort: short(hands).slice(0, 1)[0] ?? null, feltShortMin: short(all)[0] ?? null, handCards: hands.length }
    })
    const tag = `${variant === 'I dag' ? 'idag' : variant}-${size.w}x${size.h}`
    await page.screenshot({ path: `${out}/${tag}-vila.png` })
    const row = { variant, size: `${size.w}×${size.h}`, ...felt }
    if (variant !== 'B') {
      // Hovra ett handkort på filten.
      const target = await page.evaluate(() => {
        // Det sista kortet i den nedre handens fläkt: det som ligger överst.
        const fans = [...document.querySelectorAll('[data-tv] > main .byd-hand')]
        const fan = fans.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0]
        const cards = [...fan.querySelectorAll('.byd-hand-card')]
        const r = cards[cards.length - 1].getBoundingClientRect()
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
      })
      await page.mouse.move(target.x, target.y)
      await page.waitForTimeout(300)
      await settle()
      await page.waitForTimeout(200)
      const read = await page.evaluate(() => {
        const lift = document.querySelector('[data-proto511-read]')
        const insp = document.querySelector('.byd-tv-inspect > div')
        const el = lift ?? insp
        return el ? Math.round(el.getBoundingClientRect().width) : null
      })
      row.readPx = read
      row.readBody = read && +(read * BODY).toFixed(1)
      row.actions = '1 (hover)'
      await page.screenshot({ path: `${out}/${tag}-last.png` })
    } else {
      const r = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('.p511-card')]
        const w = cards[0]?.getBoundingClientRect().width ?? 0
        const visible = cards.filter((c) => { const b = c.getBoundingClientRect(); return b.right <= innerWidth && b.bottom <= innerHeight && b.left >= 0 && b.top >= 0 }).length
        return { w: Math.round(w), total: cards.length, visible }
      })
      row.readPx = r.w
      row.readBody = +(r.w * BODY).toFixed(1)
      row.actions = `0 (${r.visible} av ${r.total} kort synliga utan att rulla)`
    }
    results.push(row)
    console.log(JSON.stringify(row))
    await page.close()
  }
await browser.close()
writeFileSync(`${out}/matt.json`, JSON.stringify(results, null, 2))

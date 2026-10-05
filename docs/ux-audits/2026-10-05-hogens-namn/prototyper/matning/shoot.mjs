// Throwaway driver for the #789 prototype: table mode — the player's /online and the table's own
// screen in table mode — at 1280 × 800 and 1920 × 1080, four and eight seats, a quarter-turned
// felt (seat B) besides; each variant's CSS injected into the real built app, shot and measured.
// /faces answers 202 (the card is rendering), 500 (lost) or a PNG (the picture has arrived).
//
//   node shoot.mjs <links.json> <ut-katalog>
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CSS, JS } from './variants.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(process.argv[2], 'utf8'))
const OUT = process.argv[3] ?? join(HERE, 'shots')
mkdirSync(OUT, { recursive: true })
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

const SURFACES = [
  { id: 'online-1280', url: 'onlineA', size: [1280, 800], name: '/online 1280 × 800' },
  { id: 'online-1920', url: 'onlineA', size: [1920, 1080], name: '/online 1920 × 1080' },
  { id: 'bord-1280', url: 'tableUrl', size: [1280, 800], name: 'Bordets skärm i bordsläge 1280 × 800' },
  { id: 'bord-1920', url: 'tableUrl', size: [1920, 1080], name: 'Bordets skärm i bordsläge 1920 × 1080' },
  { id: 'vriden-1280', url: 'onlineB', size: [1280, 800], name: '/online 1280 × 800, plats B (filten vänd)' },
]
const SEATS = ['4', '8']
const VARIANTS = ['nu', 'c', 'd']
const ONLY = process.argv[4]?.split(',')

const browser = await chromium.launch()
const open = async (url, [w, h], css, state, js) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'sv-SE' })
  await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  const page = await ctx.newPage()
  if (state === 'pending') await page.route('**/faces/**', (r) => r.fulfill({ status: 202, body: 'queued' }))
  if (state === 'ready') await page.route('**/faces/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  if (state === 'failed') {
    await page.clock.install()
    await page.route('**/faces/**', (r) => r.fulfill({ status: 500, body: 'lost' }))
  }
  await page.goto(links.origin + url)
  if (css) await page.addStyleTag({ content: css })
  await page.locator('.byd-pile[data-zone="discard"]').waitFor({ state: 'attached', timeout: 20000 })
  if (state === 'failed') {
    for (let k = 0; k < 20; k++) {
      await page.clock.runFor(15_000)
      if (await page.locator('.byd-pile[data-zone="discard"] .byd-pile-top [data-texture="failed"]').count()) break
    }
    await page.clock.resume()
  }
  // The camera glides to what is in play; wait until the discard pile stands still.
  await page.waitForFunction(`(() => { const el = document.querySelector('.byd-pile[data-zone="discard"]'); const now = JSON.stringify(el.getBoundingClientRect()); window.__still = now === window.__last ? (window.__still ?? 0) + 1 : 0; window.__last = now; return window.__still >= 5 })()`, undefined, { polling: 100, timeout: 15000 })
  await page.mouse.move(0, 0)
  if (js) await page.evaluate(js)
  await page.evaluate(PAGE)
  return { ctx, page }
}

// Contrast read off the painted pixels of a box: the 10th and 98th percentile of luminance —
// the ground and the ink — so a gradient, a sweep or a translucent plate is read as drawn.
const painted = async (page, b) => {
  if (!b || b.w < 2 || b.h < 2) return null
  const buf = await page.screenshot({ clip: { x: b.x, y: b.y, width: b.w, height: b.h } })
  return page.evaluate(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,${buf.toString('base64')}'; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const L = []
    for (let i = 0; i < d.length; i += 4) L.push(0.2126 * f(d[i]) + 0.7152 * f(d[i + 1]) + 0.0722 * f(d[i + 2]))
    L.sort((a, b) => a - b)
    const p = (q) => L[Math.min(L.length - 1, Math.floor(q * L.length))]
    return Math.round(((p(0.98) + 0.05) / (p(0.1) + 0.05)) * 100) / 100
  })()`)
}

// The crop the page shows enlarged: every pile with its handle and name, padded.
const cropOf = (page) => page.evaluate(`(() => {
  const rs = [...document.querySelectorAll('.byd-pile, .byd-pile-count, .byd-pile-caption')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
  const l = Math.max(0, Math.min(...rs.map((r) => r.left)) - 40), t = Math.max(0, Math.min(...rs.map((r) => r.top)) - 30)
  const r = Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + 40), b = Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)) + 30)
  return { x: Math.round(l), y: Math.round(t), width: Math.round(r - l), height: Math.round(b - t) }
})()`)

const results = []
const run = async (v, s, seats, state, shoot) => {
  const url = links.tables[`p${seats}`][s.url]
  const { ctx, page } = await open(url, s.size, CSS[v], state, JS[v])
  await page.waitForTimeout(300)
  const m = await page.evaluate('window.__p789.measure()')
  for (const p of m.piles) if (p.box) p.painted = await painted(page, p.box)
  const file = `${v}-${s.id}-${seats}${state === 'pending' ? '' : '-' + state}`
  if (shoot) {
    await page.screenshot({ path: join(OUT, file + '.png') })
    await page.screenshot({ path: join(OUT, file + '-nara.png'), clip: await cropOf(page) })
  }
  results.push({ v, s: s.id, seats, state, file: shoot ? file : null, ...m })
  const named = m.piles.filter((p) => p.where)
  console.log(v, s.id, seats, state, named.map((p) => `${p.zone}:${p.where}:${p.px}px:«${p.shown}»:${p.meets.length ? 'KROCK ' + p.meets.join('|') : 'fri'}:närmast ${p.nearest?.what} ${p.nearest?.px}:kontrast ${p.painted}`).join('  '), 'namn kvar:', m.anyName.length)
  await ctx.close()
}

for (const seats of SEATS) for (const s of SURFACES) for (const v of VARIANTS) {
  if (ONLY && !ONLY.includes(v)) continue
  await run(v, s, seats, 'pending', true)
}
// Lost renders, and the picture arriving: the name must go in both forms.
for (const v of VARIANTS) {
  if (ONLY && !ONLY.includes(v)) continue
  await run(v, SURFACES[0], '4', 'failed', true)
  for (const s of SURFACES) for (const seats of SEATS) await run(v, s, seats, 'ready', s.id === 'online-1280' && seats === '4')
}
writeFileSync(join(OUT, `results-${ONLY?.join('_') ?? 'alla'}.json`), JSON.stringify(results, null, 2))
await browser.close()

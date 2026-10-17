// PROTOTYP — kastas (#682). Spelar bordsläget i det byggda appen på e2e-stacken (rig.mts), lägger
// varje variant ovanpå med page.js, fotograferar och mäter.
//
//   node shoot.mjs <links.json> [fråga1|fråga2|båda] [bredder] [varianter]
//
// Fråga 1 (`?v=`): var raden står. Scenerna är `blandat` (700 ms efter «Blanda» i ringen),
// `avvisat` (450 ms efter ett kort släppt på den tomma platsen C) och `efterat` (8 s efter det).
// Fråga 2 (`?k=`): ångra och avsluta. Scenerna är `vila`, `meny` och `fraga`.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..', '..', '..')
const { PNG } = createRequire(import.meta.url)(join(ROOT, 'node_modules', '.pnpm', 'pngjs@5.0.0', 'node_modules', 'pngjs'))
const L = JSON.parse(readFileSync(process.argv[2] ?? join(HERE, 'links.json'), 'utf8'))
const WHICH = process.argv[3] ?? 'båda'
const SIZES = { 1024: 768, 1280: 800, 1920: 1080 }
const WIDTHS = (process.argv[4] ?? '1024,1280,1920').split(',').map(Number)
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = join(HERE, '..', 'img')
const V1 = (process.argv[5] ?? 'nu,a,b,c,d').split(',')
const K2 = ['nu', 'a', 'b', 'c']
const BASE_V = process.env.P682_V ?? 'b'
mkdirSync(OUT, { recursive: true })

const H = { 'content-type': 'application/json', cookie: L.cookie }
async function freshTable() {
  const s = await fetch(`${L.origin}/projects/${encodeURIComponent(L.project)}/sessions`, { method: 'POST', headers: H })
  if (!s.ok) throw new Error(`bord: ${s.status} ${await s.text()}`)
  const t = await s.json()
  return `/table?session=${encodeURIComponent(t.id)}&host=${encodeURIComponent(t.hostKey)}&mode=table`
}

// WCAG:s relativa luminans och kontrast, för färger ur skärmbilden.
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const rgb = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number)

// Marken runt en platta: en ring 3–6 px utanför den, läst ur en bild där prototypens lager är dolt.
function ground(png, r) {
  const px = []
  const at = (x, y) => {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return
    const i = (png.width * y + x) * 4
    px.push([png.data[i], png.data[i + 1], png.data[i + 2]])
  }
  for (const d of [3, 6]) {
    for (let x = r.x - d; x <= r.x + r.w + d; x += 2) {
      at(x, r.y - d)
      at(x, r.y + r.h + d)
    }
    for (let y = r.y - d; y <= r.y + r.h + d; y += 2) {
      at(r.x - d, y)
      at(r.x + r.w + d, y)
    }
  }
  return px
}

const browser = await chromium.launch()
const results = []

async function open(w) {
  const ctx = await browser.newContext({ viewport: { width: w, height: SIZES[w] }, deviceScaleFactor: 1, locale: 'sv-SE' })
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('byd.lang', 'sv')
    } catch {}
  })
  const page = await ctx.newPage()
  await page.goto(L.origin + (await freshTable()))
  await page.getByRole('button', { name: 'Starta spelet' }).waitFor({ timeout: 30_000 })
  // Korten ska ha sina ansikten innan något fotograferas.
  await page.waitForFunction(() => !document.querySelector('.byd-table-start small'), null, { timeout: 60_000 }).catch(() => undefined)
  await page.evaluate(PAGE)
  return { ctx, page }
}
const center = (page, sel, i = 0) =>
  page.evaluate(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${i}]; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
async function drag(page, from, to) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 14; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 14, from.y + ((to.y - from.y) * i) / 14)
  await page.mouse.up()
}
async function populate(page) {
  await page.getByRole('button', { name: 'Starta spelet' }).click()
  await page.waitForTimeout(1500)
  const saloon = await page.evaluate(`(() => { const z = [...document.querySelectorAll('.byd-zone')].find((z) => /saloon/i.test(z.textContent)); const r = z.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width } })()`)
  for (const f of [-0.3, 0, 0.3]) {
    const deck = await center(page, '.byd-pile-top', 1)
    await drag(page, deck, { x: saloon.x + f * saloon.w, y: saloon.y })
    await page.waitForTimeout(900)
  }
  // Och ett i Framför A, så att filten nära nederkanten inte är tom.
  const front = await page.evaluate(`(() => { const z = [...document.querySelectorAll('.byd-zone')].find((z) => /Framför A/i.test(z.textContent)); const r = z.getBoundingClientRect(); return { x: r.x + r.width * 0.3, y: r.y + r.height / 2 } })()`)
  await drag(page, await center(page, '.byd-pile-top', 1), front)
  await page.waitForTimeout(1200)
  await page.evaluate('window.__p682.timings.length = 0')
}
async function shuffle(page) {
  const deck = await center(page, '.byd-pile-top', 1)
  await page.mouse.click(deck.x, deck.y)
  await page.getByRole('button', { name: 'Blanda' }).click()
}
async function refuse(page) {
  const deck = await center(page, '.byd-pile-top', 1)
  const c = await center(page, '.byd-hand', 2)
  await drag(page, deck, c)
}
async function shoot(page, file, meta) {
  await page.mouse.move(2, 2)
  const m = await page.evaluate('window.__p682.measure()')
  await page.addStyleTag({ content: '#p682 { visibility: hidden !important }', }).then((h) => h.evaluate((el) => (el.id = 'p682-hide')))
  const bare = PNG.sync.read(await page.screenshot({ type: 'png', animations: 'disabled' }))
  await page.evaluate(() => document.getElementById('p682-hide')?.remove())
  await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 80, animations: 'disabled' })
  for (const it of m.items) {
    if (!/rad|fraga|meny/.test(it.kind)) continue
    const g = ground(bare, it.rect)
    const plate = rgb(it.bg)
    const edge = rgb(it.border)
    // Plattans kant syns om antingen dess fyllning eller dess kritkant skiljer sig från marken.
    const cs = g.map((p) => Math.max(contrast(plate, p), contrast(edge, p))).sort((a, b) => a - b)
    const fill = g.map((p) => contrast(plate, p)).sort((a, b) => a - b)
    it.ground = { min: +cs[0]?.toFixed(2), median: +cs[Math.floor(cs.length / 2)]?.toFixed(2), fillMedian: +fill[Math.floor(fill.length / 2)]?.toFixed(2) }
    it.text = +contrast(rgb(it.color), plate).toFixed(2)
  }
  results.push({ file, ...meta, ...m })
  console.log(file, JSON.stringify(m.items.map((i) => [i.kind, i.side, i.rect, i.font, i.lines, i.hits, i.self, i.ground, i.text])), JSON.stringify(m.timings))
}

if (WHICH !== 'fråga2')
  for (const w of WIDTHS)
    for (const v of V1) {
      const { ctx, page } = await open(w)
      await page.evaluate(`window.__p682.set({ v: ${JSON.stringify(v)}, k: 'nu' })`)
      await populate(page)
      await shuffle(page)
      await page.waitForTimeout(700)
      await shoot(page, `v-${v}-${w}-blandat.jpg`, { q: 1, v, w, scene: 'blandat' })
      await page.waitForTimeout(1500)
      await page.evaluate('window.__p682.timings.length = 0')
      await refuse(page)
      await page.waitForTimeout(450)
      await shoot(page, `v-${v}-${w}-avvisat.jpg`, { q: 1, v, w, scene: 'avvisat' })
      await page.waitForTimeout(8000)
      await shoot(page, `v-${v}-${w}-efterat.jpg`, { q: 1, v, w, scene: 'efterat' })
      await ctx.close()
    }
if (WHICH !== 'fråga1')
  for (const w of WIDTHS)
    for (const k of K2) {
      const { ctx, page } = await open(w)
      await page.evaluate(`window.__p682.set({ v: ${JSON.stringify(BASE_V)}, k: ${JSON.stringify(k)} })`)
      await populate(page)
      await shuffle(page)
      await page.waitForTimeout(900)
      await shoot(page, `k-${k}-${w}-vila.jpg`, { q: 2, k, v: BASE_V, w, scene: 'vila' })
      if (k === 'c') {
        await page.locator('#p682 [data-p682=mer]').click()
        await page.waitForTimeout(200)
        await shoot(page, `k-${k}-${w}-meny.jpg`, { q: 2, k, v: BASE_V, w, scene: 'meny' })
      }
      if (k === 'b' || k === 'c') {
        await page.evaluate("window.__p682.openSheet('fraga')")
        await page.waitForTimeout(200)
        await shoot(page, `k-${k}-${w}-fraga.jpg`, { q: 2, k, v: BASE_V, w, scene: 'fraga' })
      }
      await ctx.close()
    }
const file = join(HERE, '..', 'data.js')
let prev = []
try {
  prev = JSON.parse(readFileSync(file, 'utf8').replace(/^[\s\S]*?window\.MATT = /, '').replace(/\n$/, ''))
} catch {}
const keep = prev.filter((p) => !results.some((r) => r.file === p.file))
writeFileSync(file, `// Mätt av matning/shoot.mjs på det byggda appen (#682).\nwindow.MATT = ${JSON.stringify([...keep, ...results])}\n`)
await browser.close()
process.exit(0)

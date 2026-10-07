// PROTOTYP — kastas (#695). Öppnar Tabell-fliken i den byggda editorn på e2e-stacken, lägger
// varje variant ovanpå med page.js, mäter och fotograferar.
//
//   node shoot.mjs <ut-katalog> nu,a,b,c,d [ytor]
//
// En yta är <lek>-<bredd>[-linux][-extra]: prov-1280, tat-1024-linux, prov-1024-markerat,
// prov-1280-hjalp, prov-1280-tryckt.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c,d').split(',')
const H = { 1440: 900, 1280: 800, 1024: 768 }
const ALL = []
for (const deck of ['prov', 'tat']) for (const w of [1440, 1280, 1024]) ALL.push(`${deck}-${w}`)
for (const deck of ['prov', 'tat']) for (const w of [1280, 1024]) ALL.push(`${deck}-${w}-linux`)
ALL.push('prov-1024-markerat', 'prov-1280-hjalp', 'tat-1280-tryckt', 'prov-1280-tryckt')
const SURF = (process.argv[4] ?? ALL.join(',')).split(',')
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const results = []
for (const s of SURF) for (const v of VARIANTS) {
  const [deck, ws, ...rest] = s.split('-')
  const w = Number(ws)
  const linux = rest.includes('linux')
  const extra = rest.find((x) => x !== 'linux')
  if (extra === 'tryckt' && v !== 'a' && v !== 'nu') continue
  if (extra === 'hjalp' && v === 'nu') continue
  const ctx = await browser.newContext({ viewport: { width: w, height: H[w] }, deviceScaleFactor: 1, locale: 'sv-SE' })
  await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  await ctx.addInitScript(() => { try { localStorage.setItem('byd.lang', 'sv') } catch {} })
  const page = await ctx.newPage()
  await page.goto(links.origin + links[deck].url)
  await page.locator('#byd-editor-tab-table').click()
  await page.locator('.byd-data tbody tr').first().waitFor()
  await page.waitForFunction(() => document.querySelector('table.byd-data')?.style.tableLayout === 'fixed')
  await page.waitForTimeout(500)
  await page.evaluate(PAGE)
  if (linux) {
    await page.evaluate('window.__p695.linux()')
    // The table measures again when the room changes, which is the one way in from outside.
    await page.setViewportSize({ width: w - 1, height: H[w] })
    await page.waitForTimeout(300)
    await page.setViewportSize({ width: w, height: H[w] })
    await page.waitForTimeout(500)
  }
  await page.mouse.move(w / 2, 20)
  const placed = await page.evaluate(`window.__p695.place(${JSON.stringify(v)})`)
  await page.waitForTimeout(300)
  let help = null
  if (extra === 'markerat') {
    const ticks = page.locator('.byd-data tbody .byd-data-check input')
    await ticks.nth(0).check()
    await ticks.nth(1).check()
    await page.mouse.move(w / 2, 20)
    await page.waitForTimeout(300)
  }
  if (extra === 'hjalp') help = await page.evaluate('window.__p695.help()')
  if (extra === 'tryckt') {
    if (v === 'a') await page.evaluate('window.__p695.stepRight()')
    else await page.evaluate(`document.querySelector('.byd-data-scroll').scrollBy({ left: document.querySelector('.byd-data-scroll').clientWidth * 0.8 })`)
    await page.waitForTimeout(900)
  }
  const m = await page.evaluate('window.__p695.measure()')
  const file = `${v}-${s}.png`
  await page.screenshot({ path: join(OUT, file) })
  // Keyboard reach: from the first row's tick, real Tab presses until the focus is in that row's
  // antal — and whether the field the focus landed in can be read, not under a pin.
  let reach = null
  if (!extra) {
    await page.evaluate(`document.querySelector('.byd-data-scroll').scrollLeft = 0`)
    await page.locator('.byd-data tbody tr').first().locator('.byd-data-check input').focus()
    let n = 0
    for (; n < 40; n++) {
      const at = await page.evaluate(`(document.activeElement?.getAttribute('aria-label') || '')`)
      if (/ antal$/.test(at)) break
      await page.keyboard.press('Tab')
    }
    const seen = await page.evaluate(`(() => {
      const el = document.activeElement, r = el.getBoundingClientRect(), b = document.querySelector('.byd-data-scroll')
      const x = r.left + r.width / 2, y = r.top + r.height / 2
      const top = document.elementFromPoint(x, y)
      return { onTop: !!top && (top === el || el.contains(top) || top.contains(el)), scrollLeft: Math.round(b.scrollLeft) }
    })()`)
    reach = { tabs: n < 40 ? n : null, ...seen }
  }
  results.push({ v, s, file, placed, help, reach, ...m })
  console.log(v, s, m.antal, m.grupp, `ute ${m.outside} delvis ${m.partial}`, m.said.join(' | '), reach ? `tab ${reach.tabs}` : '')
  await ctx.close()
}
writeFileSync(join(OUT, `results-${Date.now()}.json`), JSON.stringify(results, null, 1))
await browser.close()
process.exit(0)

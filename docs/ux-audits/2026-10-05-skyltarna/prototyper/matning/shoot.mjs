// Throwaway driver for the #683 prototype: the room's television at 1280 × 800 and 1920 × 1080,
// four and eight seats, each variant's plate placement injected into the real built app, shot and
// measured. /faces answers 202 the whole pass, so every face-up pile shows #771's caption.
//
//   node shoot.mjs <ut-katalog> nu,a,c,c2,ac,b,bc,d
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
const SURF = (process.argv[4] ?? 'tv-1280,tv-1920').split(',')
const SEATS = (process.argv[5] ?? '4,8').split(',')
mkdirSync(OUT, { recursive: true })
const SIZES = { 'tv-1280': [1280, 800], 'tv-1920': [1920, 1080], 'bord-1280': [1280, 800], 'online-1280': [1280, 800] }
const URLS = { tv: 'tvUrl', bord: 'tableUrl', online: 'onlineUrl' }
const browser = await chromium.launch()
const open = async (url, w, h, css) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'sv-SE' })
  await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  const page = await ctx.newPage()
  await page.goto(links.origin + url)
  if (css) await page.addStyleTag({ content: css })
  await page.locator('.byd-zone').first().waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(2200)
  await page.mouse.move(0, 0)
  await page.evaluate(PAGE)
  return { ctx, page }
}
// Ada takes seat A once, so plate A says a name and the others «ledig», as at the play test.
for (const t of Object.values(links.tables)) {
  if (!t.onlineUrl) continue
  const { ctx } = await open(t.onlineUrl, 1280, 800)
  await ctx.close()
}
const results = []
for (const seats of SEATS) for (const s of SURF) for (const v of VARIANTS) {
  const [w, h] = SIZES[s]
  const url = links.tables[v === 'd' ? `p${seats}d` : `p${seats}`][URLS[s.split('-')[0]]]
  let { ctx, page } = await open(url, w, h)
  let said = await page.evaluate(`window.__p683.place(${JSON.stringify(v)})`)
  let shrink = 0
  // B: when the band above or below the felt is not deep enough, the frame gives up the depth and
  // the felt is fitted again, smaller. That is the variant's price, and it is measured.
  for (let k = 0; k < 4 && said._need && (said._need.top > said._need.haveTop || said._need.bottom > said._need.haveBottom); k++) {
    shrink += Math.max(said._need.top - said._need.haveTop, said._need.bottom - said._need.haveBottom, 0) + 2
    await ctx.close()
    ;({ ctx, page } = await open(url, w, h, `.byd-table-frame { box-sizing: border-box !important; border-block: ${shrink}px solid transparent !important; }`))
    said = await page.evaluate(`window.__p683.place(${JSON.stringify(v)})`)
  }
  await page.waitForTimeout(150)
  const m = await page.evaluate('window.__p683.measure()')
  const file = `${v}-${s}-${seats}.png`
  await page.screenshot({ path: join(OUT, file) })
  results.push({ v, s, seats, file, said, shrink, ...m })
  const n = (k) => m[k].length
  console.log(v, s, seats, `över ${n('over')} zon ${n('inZone')} skylt ${n('onPlate')} zonnamn ${n('onZoneName')} hand ${n('onHand')} krom ${n('chrome' in m ? 'onChrome' : 'onChrome')} kapad ${n('cut')} bred ${JSON.stringify(m.wide)} px ${m.smallest} kort ${m.card} krymp ${shrink}`, JSON.stringify(said))
  await ctx.close()
}
writeFileSync(join(OUT, `results-${VARIANTS.join('_')}-${SURF.join('_')}-${SEATS.join('_')}.json`), JSON.stringify(results, null, 2))
await browser.close()

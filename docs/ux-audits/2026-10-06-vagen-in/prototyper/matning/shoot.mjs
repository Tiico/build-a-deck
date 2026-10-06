// Throwaway driver for the #675 prototype: every surface the issue names — the start page, /join
// without a code, with an unknown code and with a live one, the room's TV at 1280 and 1920 and
// table mode — opened in the real built app on the e2e stack, each variant injected by page.js,
// shot and measured.
//
//   node shoot.mjs <ut-katalog> nu,a,b,c,d [ytor]
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
// Every surface: its address, its viewport, whether it is a phone (touch, mobile UA) and whether
// the visitor is the signed-in designer. The guest on / is signed out, which is the whole point.
const SURFACES = {
  'start-390': { url: '/', w: 390, h: 844, phone: true },
  'start-320': { url: '/', w: 320, h: 568, phone: true },
  'start-1280': { url: '/', w: 1280, h: 800 },
  'nokod-390': { url: '/join', w: 390, h: 844, phone: true },
  'nokod-320': { url: '/join', w: 320, h: 568, phone: true },
  'nokod-1280': { url: '/join', w: 1280, h: 800 },
  'okand-390': { url: '/join?code=ZZZZZZ', w: 390, h: 844, phone: true },
  'join-390': { url: `/join?code=${links.code}`, w: 390, h: 844, phone: true },
  'join-320': { url: `/join?code=${links.code}`, w: 320, h: 568, phone: true },
  'join-1280': { url: `/join?code=${links.code}`, w: 1280, h: 800 },
  'tv-1280': { url: links.tvUrl, w: 1280, h: 800, owner: true },
  'tv-1920': { url: links.tvUrl, w: 1920, h: 1080, owner: true },
  'bord-1280': { url: links.tableUrl, w: 1280, h: 800, owner: true },
}
const SURF = (process.argv[4] ?? Object.keys(SURFACES).join(',')).split(',')
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const ready = {
  start: '.byd-login, [data-variant-root]',
  nokod: 'h1',
  okand: 'h1',
  join: '.byd-join-table button',
  tv: '.byd-zone',
  bord: '.byd-zone',
}
// Table mode draws no square of its own; variants that give it one make it with the library the
// app already ships, from the address the TV's square carries.
const { default: QR } = await import(join(HERE, '..', '..', '..', '..', '..', 'packages', 'web', 'node_modules', 'qrcode', 'lib', 'index.js'))
const qr = `data:image/svg+xml;utf8,${encodeURIComponent(await QR.toString(`${links.origin}/join?code=${links.code}`, { type: 'svg', margin: 1 }))}`
// Ada sits down at A from her phone, so that the picker and the TV show one taken seat.
{
  const j = await fetch(`${links.origin}/rooms/${links.code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Ada', seat: 'A' }) })
  // A 409 is the rig's own reservation for her, still pending: her phone claims it with that token.
  const url = j.ok ? `/play?${new URLSearchParams({ session: links.session, code: links.code, seat: 'A', name: 'Ada', token: (await j.json()).token })}` : links.playUrl
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  await page.goto(links.origin + url)
  await page.waitForTimeout(3000)
  await ctx.close()
}
const results = []
for (const s of SURF) for (const v of VARIANTS) {
  const S = SURFACES[s]
  const ctx = await browser.newContext({
    viewport: { width: S.w, height: S.h }, deviceScaleFactor: 1, locale: 'sv-SE',
    ...(S.phone ? { isMobile: true, hasTouch: true } : {}),
  })
  if (S.owner) await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  await ctx.addInitScript(() => { try { localStorage.setItem('byd.lang', 'sv') } catch {} })
  const page = await ctx.newPage()
  await page.goto(links.origin + S.url)
  await page.locator(ready[s.split('-')[0]]).first().waitFor({ state: 'attached', timeout: 20000 })
  await page.waitForTimeout(s.startsWith('tv') || s.startsWith('bord') ? 2200 : 900)
  await page.mouse.move(0, 0)
  await page.evaluate(PAGE)
  const said = await page.evaluate(`window.__p675.place(${JSON.stringify(v)}, ${JSON.stringify(s)}, ${JSON.stringify({ code: links.code, game: "Sal's Saloon", qr })})`)
  await page.waitForTimeout(250)
  const m = await page.evaluate(`window.__p675.measure(${JSON.stringify(s)})`)
  const file = `${v}-${s}.png`
  await page.screenshot({ path: join(OUT, file) })
  results.push({ v, s, file, said, ...m })
  console.log(v, s, JSON.stringify(m))
  await ctx.close()
}
writeFileSync(join(OUT, `results-${VARIANTS.join('_')}-${SURF.length}.json`), JSON.stringify(results, null, 2))
await browser.close()

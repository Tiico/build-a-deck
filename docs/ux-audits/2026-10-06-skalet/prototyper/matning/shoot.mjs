// Engångsmätning för prototypen till #749: varje variants skal på varje route, i mörkt och ljust
// läge, på strypt nät — det BYGGDA appen från rig.mts, inget ritat för hand.
//
//   node shoot.mjs <ut-katalog> nu,a,b,c,d [routes] [dark,light]
//
// Per körning, tre sätt att se samma sida:
//  1. Strypt (CDP Network.emulateNetworkConditions: 400 ms latens, 400 kbit/s åt båda hållen —
//     speltestets profil i #749), cachen av, med CDP-screencast: varje ram med sin tidpunkt. Ur den:
//     första målade ram, första ram som inte är vit, ramarna vid 1 s, 3 s och 5,5 s, och skillnaden
//     mellan skalets sista ram och appens första. Plus first-paint/FCP, när appen tog över #root och
//     layout-shift-poster (CLS) ur sidan själv.
//  2. Entrén stoppad på tråden, onstrypt: skalet står kvar som det skulle göra på ett nät som aldrig
//     kommer fram. Bilder vid 1 s och 5,5 s, och textens kontrast mot det den står på.
//  3. Utan JavaScript.
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const W = join(HERE, '..', '..', '..', '..', '..')
const require = createRequire(import.meta.url)
const { jpegjs } = require(join(W, 'node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/utilsBundle.js'))

const OUT = process.argv[2] ?? join(HERE, 'ut')
const links = JSON.parse(readFileSync(join(OUT, 'links.json'), 'utf8'))
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
const ROUTES = {
  start: { vp: [1440, 900], login: true },
  login: { vp: [1440, 900] },
  editor: { vp: [1440, 900], login: true },
  tv: { vp: [1920, 1080] },
  bord: { vp: [1280, 800] },
  join: { vp: [390, 844], phone: true },
  play: { vp: [390, 844], phone: true },
  observe: { vp: [390, 844], phone: true },
}
const WHICH = (process.argv[4] ?? Object.keys(ROUTES).join(',')).split(',')
const SCHEMES = (process.argv[5] ?? 'dark,light').split(',')
const ONLY = (process.env['ONLY'] ?? 'throttled,stalled,nojs').split(',')
const PROFILE = { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 }
mkdirSync(join(OUT, 'img'), { recursive: true })

// Det sidan själv vet: målningar, layoutskiften och när appen tog över #root (React tömmer #root
// vid sin första ritning; allt i skalet bär data-byd-shell).
const INIT = `
window.__m = { shifts: [], takeover: null };
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.shifts.push({ t: e.startTime, v: e.value }) }).observe({ type: 'layout-shift', buffered: true }) } catch {}
new MutationObserver((_, self) => {
  const r = document.getElementById('root'); if (!r) return; self.disconnect();
  const look = () => { if (window.__m.takeover == null && [...r.children].some((c) => !c.hasAttribute('data-byd-shell'))) window.__m.takeover = performance.now() };
  new MutationObserver(look).observe(r, { childList: true }); look();
}).observe(document, { childList: true, subtree: true });
`
// Kontrast för varje textbärande element i skalet mot den färg det faktiskt står på.
const CONTRAST = `(() => {
  const rgb = (s) => { const m = s.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b) };
  const ground = (el) => { for (let e = el; e; e = e.parentElement) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c } return { r: 255, g: 255, b: 255, a: 1 } };
  const out = [];
  for (const el of document.querySelectorAll('[data-byd-shell] *, [data-byd-shell]')) {
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || r.width === 0 || Number(cs.opacity) < 0.05) continue;
    const fg = rgb(cs.color), bg = ground(el);
    const a = lum(fg), b = lum(bg);
    out.push({ text: el.textContent.trim().slice(0, 60), px: parseFloat(cs.fontSize), weight: cs.fontWeight, ratio: Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100 });
  }
  return out;
})()`
const TEXT = `[...document.querySelectorAll('[data-byd-shell] *, [data-byd-shell]')].filter((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && cs.visibility !== 'hidden' && cs.display !== 'none' && r.width > 0 && Number(cs.opacity) > 0.05 }).map((el) => el.textContent.trim()).join(' · ')`

const browser = await chromium.launch()
async function open(v, route, scheme, opts = {}) {
  const R = ROUTES[route]
  const L = links[v]
  const ctx = await browser.newContext({ viewport: { width: R.vp[0], height: R.vp[1] }, deviceScaleFactor: 1, colorScheme: scheme, locale: 'sv-SE', hasTouch: !!R.phone, isMobile: !!R.phone, javaScriptEnabled: opts.js !== false })
  if (R.login) await ctx.addCookies([{ name: L.cookie.split('=')[0], value: L.cookie.split('=').slice(1).join('='), url: L.origin }])
  await ctx.addInitScript(INIT)
  // Texturerna är inte frågan, och utan renderare svarar /faces aldrig klart.
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  const page = await ctx.newPage()
  return { ctx, page, url: L.origin + L.urls[route] }
}

// Ram → andel nästan vita bildpunkter, medelfärg, och en jämförelse med en annan ram.
function decode(b64) { return jpegjs.decode(Buffer.from(b64, 'base64'), { useTArray: true }) }
function stats(img) {
  const d = img.data; let white = 0, n = 0, r = 0, g = 0, b = 0
  for (let i = 0; i < d.length; i += 16) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) white++ }
  return { white: white / n, mean: [r / n, g / n, b / n].map(Math.round) }
}
function diff(a, b) {
  if (a.width !== b.width || a.height !== b.height) return 1
  let changed = 0, n = 0
  for (let i = 0; i < a.data.length; i += 16) { n++; if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 48) changed++ }
  return changed / n
}

const results = []
const save = () => writeFileSync(join(OUT, `results-${VARIANTS.join('_')}-${WHICH.join('_')}-${SCHEMES.join('_')}.json`), JSON.stringify(results, null, 2))
for (const v of VARIANTS) for (const route of WHICH) for (const scheme of SCHEMES) {
  const res = { v, route, scheme }
  const R = ROUTES[route]
  const scale = R.vp[0] > 1000 ? 0.5 : 1

  if (ONLY.includes('throttled')) {
    const { ctx, page, url } = await open(v, route, scheme)
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
    await cdp.send('Network.emulateNetworkConditions', PROFILE)
    const frames = []
    cdp.on('Page.screencastFrame', (f) => { frames.push({ ts: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: Math.round(R.vp[0] * scale), maxHeight: Math.round(R.vp[1] * scale), everyNthFrame: 1 })
    const t0 = Date.now()
    await page.goto(url, { waitUntil: 'commit', timeout: 60_000 })
    // Vid 5,5 s: står «tar längre»-raden?
    const at = async (ms) => { for (;;) { const now = await page.evaluate('performance.now()').catch(() => 0); if (now >= ms) return; await page.waitForTimeout(Math.min(200, ms - now)) } }
    await at(5500)
    res.at55 = await page.evaluate(`({ takeover: window.__m.takeover, text: ${TEXT} })`)
    // Till appen har tagit över och stått still en stund.
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline && (await page.evaluate('window.__m.takeover')) == null) await page.waitForTimeout(250)
    await page.waitForTimeout(2500)
    const m = await page.evaluate(`({ timeOrigin: performance.timeOrigin, takeover: window.__m.takeover, shifts: window.__m.shifts, paint: Object.fromEntries(performance.getEntriesByType('paint').map((e) => [e.name, Math.round(e.startTime)])), nav: performance.getEntriesByType('navigation')[0]?.responseEnd })`)
    await cdp.send('Page.stopScreencast')
    const fs = frames.map((f) => ({ t: f.ts - m.timeOrigin, data: f.data })).sort((a, b) => a.t - b.t)
    for (const f of fs) Object.assign(f, stats(f.img = decode(f.data)))
    // Ramar före navigeringen (about:blank) räknas inte.
    const ff = fs.filter((f) => f.t >= 0)
    const firstPainted = ff.find((f) => true)
    const firstNonWhite = ff.find((f) => f.white < 0.5)
    const whiteFrames = ff.filter((f) => f.white >= 0.5 && (m.takeover == null || f.t < m.takeover + 3000))
    const before = [...ff].reverse().find((f) => f.t < m.takeover)
    const after = ff.find((f) => f.t >= m.takeover)
    res.throttled = {
      responseEnd: Math.round(m.nav ?? 0), paint: m.paint, takeover: m.takeover && Math.round(m.takeover),
      firstFrame: firstPainted && Math.round(firstPainted.t), firstNonWhite: firstNonWhite && Math.round(firstNonWhite.t),
      whiteFrames: whiteFrames.length, whiteUntil: whiteFrames.length ? Math.round(whiteFrames.at(-1).t) : null,
      cls: Math.round(m.shifts.reduce((s, x) => s + x.v, 0) * 1000) / 1000,
      takeoverDiff: before && after ? Math.round(diff(before.img, after.img) * 1000) / 10 : null,
      frames: ff.length, wall: Date.now() - t0,
    }
    for (const [name, ms] of [['1s', 1000], ['3s', 3000], ['55s', 5500]]) {
      const f = [...ff].reverse().find((x) => x.t <= ms)
      const file = `${v}-${route}-${scheme}-${name}.jpg`
      if (f) writeFileSync(join(OUT, 'img', file), Buffer.from(f.data, 'base64'))
      res.throttled[`f${name}`] = f ? { file, white: Math.round(f.white * 100), mean: f.mean } : null
    }
    if (before) { writeFileSync(join(OUT, 'img', `${v}-${route}-${scheme}-fore.jpg`), Buffer.from(before.data, 'base64')) }
    if (after) { writeFileSync(join(OUT, 'img', `${v}-${route}-${scheme}-efter.jpg`), Buffer.from(after.data, 'base64')) }
    writeFileSync(join(OUT, 'img', `${v}-${route}-${scheme}-slut.jpg`), Buffer.from(ff.at(-1).data, 'base64'))
    await ctx.close()
  }

  if (ONLY.includes('stalled') && v !== 'nu') {
    const { ctx, page, url } = await open(v, route, scheme)
    await ctx.route('**/assets/index-*.js', (r) => r.abort())
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(800)
    res.contrast = await page.evaluate(CONTRAST)
    res.text1 = await page.evaluate(TEXT)
    await page.screenshot({ path: join(OUT, 'img', `${v}-${route}-${scheme}-skal.png`) })
    await page.waitForFunction('performance.now() > 5200')
    res.contrastSlow = await page.evaluate(CONTRAST)
    res.text5 = await page.evaluate(TEXT)
    await page.screenshot({ path: join(OUT, 'img', `${v}-${route}-${scheme}-skal5.png`) })
    await ctx.close()
  }

  if (ONLY.includes('nojs') && scheme === SCHEMES[0]) {
    const { ctx, page, url } = await open(v, route, scheme, { js: false })
    await page.goto(url, { waitUntil: 'load' })
    await page.waitForTimeout(500)
    res.nojs = await page.evaluate(`({ text: document.body.innerText.trim().slice(0, 200), bg: getComputedStyle(document.documentElement).backgroundColor, body: getComputedStyle(document.body).backgroundColor })`).catch((e) => ({ error: String(e) }))
    // Utan JS går inte page.evaluate att köra skript i alla lägen; bilden är beviset.
    await page.screenshot({ path: join(OUT, 'img', `${v}-${route}-${scheme}-nojs.png`) })
    await ctx.close()
  }
  results.push(res)
  console.log(JSON.stringify({ v, route, scheme, t: res.throttled && { ...res.throttled, f1s: res.throttled.f1s?.white, f3s: res.throttled.f3s?.white, f55s: res.throttled.f55s?.white }, at55: res.at55?.text, text1: res.text1, text5: res.text5, contrast: res.contrast?.map((c) => c.ratio), nojs: res.nojs?.text?.slice(0, 60) }))
  save()
}
await browser.close()

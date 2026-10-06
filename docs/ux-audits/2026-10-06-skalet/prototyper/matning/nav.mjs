// «Ingen vit ram vid navigering» (#749): en sida som redan står färdig byter adress inom appen, och
// varje ram mellan klicket och nästa sidas första ritning räknas. Två vägar: startsidan → editorn
// på skrivbordet (inloggad), och /join → /play på telefonen. Ljust läge, eftersom det är där
// webbläsarens tomma duk är vit; strypt nät som i shoot.mjs, men först efter att första sidan är
// färdig, så att det är bytet som mäts.
//
//   node nav.mjs <ut-katalog> nu,a,b,c,d
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const W = join(HERE, '..', '..', '..', '..', '..')
const { jpegjs } = createRequire(import.meta.url)(join(W, 'node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/utilsBundle.js'))
const OUT = process.argv[2]
const links = JSON.parse(readFileSync(join(OUT, 'links.json'), 'utf8'))
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
const SCHEME = process.env['SCHEME'] ?? 'light'
const PROFILE = { offline: false, latency: 400, downloadThroughput: 50_000, uploadThroughput: 50_000 }
mkdirSync(join(OUT, 'img'), { recursive: true })
const browser = await chromium.launch()
const white = (b64) => {
  const d = jpegjs.decode(Buffer.from(b64, 'base64'), { useTArray: true }).data
  let w = 0, n = 0
  for (let i = 0; i < d.length; i += 16) { n++; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) w++ }
  return w / n
}
const out = []
for (const v of VARIANTS) for (const path of ['start>editor', 'join>play']) {
  const L = links[v]
  const [from, to] = path.split('>')
  const phone = from === 'join'
  const ctx = await browser.newContext({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: SCHEME, locale: 'sv-SE', hasTouch: phone, isMobile: phone })
  await ctx.addCookies([{ name: L.cookie.split('=')[0], value: L.cookie.split('=').slice(1).join('='), url: L.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  const page = await ctx.newPage()
  await page.goto(L.origin + L.urls[from], { waitUntil: 'load' })
  await page.waitForTimeout(3000)
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', PROFILE)
  const frames = []
  cdp.on('Page.screencastFrame', (f) => { frames.push({ ts: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) })
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: phone ? 390 : 720, maxHeight: phone ? 844 : 450, everyNthFrame: 1 })
  await page.waitForTimeout(500)
  const t0 = Date.now()
  // Telefonen går från rumsvalet till sin hand med en vanlig navigering; editorn öppnas från en
  // länk på startsidan. Båda är dokumentbyten, inte klientrouting.
  await page.evaluate(`location.href = ${JSON.stringify(L.urls[to])}`)
  await page.waitForTimeout(9000)
  await cdp.send('Page.stopScreencast')
  const after = frames.filter((f) => f.ts >= t0 - 50)
  const ws = after.map((f) => white(f.data))
  const whites = ws.filter((x) => x >= 0.5).length
  const firstNew = after.findIndex((f, i) => i > 0 && f.data !== after[0].data)
  const r = { v, path, frames: after.length, whiteFrames: whites, firstChange: firstNew > 0 ? Math.round(after[firstNew].ts - t0) : null }
  if (firstNew > 0) writeFileSync(join(OUT, 'img', `nav-${v}-${from}-${to}-${SCHEME}.jpg`), Buffer.from(after[firstNew].data, 'base64'))
  out.push(r)
  console.log(JSON.stringify(r))
  await ctx.close()
}
writeFileSync(join(OUT, `nav-${VARIANTS.join('_')}-${SCHEME}.json`), JSON.stringify(out, null, 2))
await browser.close()

// Bordslägets vita ram efter övertagandet (#749, utanför skalet): /table?mode=table på Nu, med
// screencast, och varje ram där mer än 30 % av bildpunkterna är nästan vita sparas.
//
//   node probe-bord.mjs slow|fast <ut-katalog>
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
const O = process.argv[3] // ut-katalogen från rig.mts
const { jpegjs } = createRequire(import.meta.url)('../../../../../node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/utilsBundle.js')
const L = JSON.parse(readFileSync(O + '/links.json', 'utf8')).nu
const throttle = process.argv[2] !== 'fast'
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'dark' })
await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
const p = await ctx.newPage()
const cdp = await ctx.newCDPSession(p)
await cdp.send('Network.enable')
if (throttle) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000 })
const fr = []
cdp.on('Page.screencastFrame', (f) => { fr.push({ ts: f.metadata.timestamp * 1000, data: f.data }); cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) })
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: 640, maxHeight: 400 })
await p.goto(L.origin + L.urls.bord, { waitUntil: 'commit' })
await p.waitForTimeout(throttle ? 14000 : 5000)
const to = await p.evaluate('performance.timeOrigin')
let k = 0
for (const f of fr) {
  const d = jpegjs.decode(Buffer.from(f.data, 'base64'), { useTArray: true }).data
  let w = 0, n = 0
  for (let i = 0; i < d.length; i += 16) { n++; if (d[i] > 235 && d[i + 1] > 235 && d[i + 2] > 235) w++ }
  if (w / n > 0.3) { console.log(throttle ? 'slow' : 'fast', Math.round(f.ts - to), (w / n).toFixed(2)); writeFileSync(`${O}/probe-${throttle ? 's' : 'f'}${k++}.jpg`, Buffer.from(f.data, 'base64')) }
}
console.log('frames', fr.length)
await b.close()

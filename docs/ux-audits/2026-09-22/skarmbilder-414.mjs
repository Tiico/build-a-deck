/* global process, console, URL */
// Skärmbilderna till prototypen för #414, så att issuet går att läsa utan att köra något.
//
// Körs så här, från repots rot:
//   packages/server/node_modules/.bin/tsx docs/ux-audits/2026-09-22/generera-414.ts
//   python3 -m http.server 8793 --directory docs/ux-audits/2026-09-22 &
//   (cd packages/web && node ../../docs/ux-audits/2026-09-22/skarmbilder-414.mjs)
//
// Playwright ligger i `packages/web`, vilket är varför skriptet körs därifrån. Sidan serveras
// från revisionskatalogen och inte från `prototyper/`, eftersom kortens typsnitt ligger i
// `../typsnitt/` och en server rotad i `prototyper/` inte når dit.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// Playwright ligger inte bredvid den här filen utan i `packages/web`, så modulen letas upp från
// katalogen skriptet körs i i stället för från katalogen det ligger i.
const krav = createRequire(`${process.cwd()}/`)
const playwright = await import(pathToFileURL(krav.resolve('playwright')).href)
const chromium = playwright.chromium ?? playwright.default.chromium

const UT = new URL('./bilder/', import.meta.url).pathname
const ADRESS = 'http://localhost:8793/prototyper/04-framfor-mig-publik.html'
const LÄGEN = { idag: 'idag', d: 'd-publik', ryggar: 'ryggar', privat: 'formgivarens-egen' }

const webbläsare = await chromium.launch()
const sida = await webbläsare.newPage({ viewport: { width: 1520, height: 1100 }, deviceScaleFactor: 2 })
const fel = []
sida.on('pageerror', (e) => fel.push(String(e)))
sida.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
await sida.goto(ADRESS, { waitUntil: 'networkidle' })
await sida.waitForTimeout(600)

// Vakten mot tomhet: sidan mäter själv hur brett kortet på filten blev, och en bild av en sida
// som inte ritade något kort är ingen bild av något.
const mätt = await sida.textContent('#matt-kort')
if (!/px$/.test(mätt ?? '')) throw new Error(`sidan ritade inget kort: ${mätt}`)

for (const [läge, namn] of Object.entries(LÄGEN)) {
  await sida.click(`button[data-valj="${läge}"]`)
  await sida.waitForTimeout(250)
  await sida.locator(`.lage[data-lage="${läge}"] .tv`).first().screenshot({ path: `${UT}414-tv-${namn}.png` })
  if (läge !== 'privat') await sida.locator('.telefonpar').screenshot({ path: `${UT}414-telefoner-${namn}.png` })
}

await sida.click('button[data-valj="d"]')
await sida.waitForTimeout(250)
const sektioner = await sida.$$('section')
const namn = ['skarmarna', 'trafiken', 'patchen', 'rad-623', 'fynden', 'b-vagen']
for (const [i, s] of sektioner.entries()) if (namn[i] && ['trafiken', 'patchen', 'rad-623', 'fynden'].includes(namn[i])) await s.screenshot({ path: `${UT}414-${namn[i]}.png` })
await sida.screenshot({ path: `${UT}414-hela-sidan.png`, fullPage: true })

await webbläsare.close()
if (fel.length > 0) {
  console.error(fel)
  process.exit(1)
}
console.log('skrev bilderna; kortet på filten mätte', mätt)

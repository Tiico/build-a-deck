/* global process, console, URL */
// Skärmbilderna till prototypen för #449, så att issuet går att läsa utan att köra något.
//
// Körs så här, från repots rot:
//   packages/server/node_modules/.bin/tsx docs/ux-audits/2026-09-22/generera-449.ts
//   python3 -m http.server 8797 --directory docs/ux-audits/2026-09-22 &
//   (cd packages/web && node ../../docs/ux-audits/2026-09-22/skarmbilder-449.mjs)
//
// Playwright ligger i `packages/web`, vilket är varför skriptet körs därifrån. Sidan serveras
// från revisionskatalogen och inte från `prototyper/`, eftersom kortens typsnitt ligger i
// `../typsnitt/` och en server rotad i `prototyper/` inte når dit.
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const krav = createRequire(`${process.cwd()}/`)
const playwright = await import(pathToFileURL(krav.resolve('playwright')).href)
const chromium = playwright.chromium ?? playwright.default.chromium

const UT = new URL('./bilder/', import.meta.url).pathname
const ADRESS = 'http://localhost:8797/prototyper/05-kortets-plats.html'
const REGLER = { nu: 'nulaget', rad: 'radvis', fjader: 'fjadrat', stapel: 'staplat', packa: 'packar' }

const webbläsare = await chromium.launch()
const sida = await webbläsare.newPage({ viewport: { width: 1560, height: 1100 }, deviceScaleFactor: 2 })
const fel = []
sida.on('pageerror', (e) => fel.push(String(e)))
sida.on('console', (m) => m.type() === 'error' && fel.push(m.text()))
await sida.goto(ADRESS, { waitUntil: 'networkidle' })
await sida.waitForTimeout(600)

// Vakten mot tomhet: sidan mäter själv hur brett kortet på filten blev, och en bild av en sida
// som inte ritade något kort är ingen bild av något.
const mätt = await sida.textContent('#matt-kort')
if (!/px på en riktig TV$/.test(mätt ?? '')) throw new Error(`sidan ritade inget kort: ${mätt}`)

const välj = async (grupp, värde) => {
  await sida.click(`button[data-grupp="${grupp}"][data-valj="${värde}"]`)
  await sida.waitForTimeout(250)
}

for (const [regel, namn] of Object.entries(REGLER)) {
  await välj('kand', regel)
  for (const platser of ['4', '8']) {
    await välj('platser', platser)
    const synlig = `.lage[data-kand="${regel}"][data-platser="${platser}"]`
    await sida.locator(`${synlig} .tv`).first().screenshot({ path: `${UT}449-tv-${namn}-${platser}platser.png` })
    if (platser === '4') await sida.locator(`${synlig} .utsnittsrad`).screenshot({ path: `${UT}449-ytan-fylls-${namn}.png` })
  }
  await välj('platser', '4')
}

// Avsnitten, för den som läser issuet i stället för sidan.
await välj('kand', 'fjader')
const sektioner = await sida.$$('section')
const namn = ['skarmarna', 'ytan-fylls', 'k2', 'taken', 'fynden', 'rekommendation', 'oppna-fragan']
for (const [i, s] of sektioner.entries()) if (namn[i]) await s.screenshot({ path: `${UT}449-${namn[i]}.png` })
await sida.screenshot({ path: `${UT}449-hela-sidan.png`, fullPage: true })

await webbläsare.close()
if (fel.length > 0) {
  console.error(fel)
  process.exit(1)
}
console.log('skrev bilderna; kortet på filten mätte', mätt)

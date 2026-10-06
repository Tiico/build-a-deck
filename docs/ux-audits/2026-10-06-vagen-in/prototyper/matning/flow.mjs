// Drives each variant's way in on a 390 phone, from the address the TV says to a seat, and counts
// what it took: page loads before the picker, characters typed (the address bar included) and
// presses. The variant's form is injected by page.js on each page it needs one, as in shoot.mjs.
// C's `/<KOD>` route does not exist in the app, so its one load is the picker reached directly.
//
//   node flow.mjs > flow.json
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const HOST = 'deck.ockelberg.com'
const code = links.code
const browser = await chromium.launch()
// What the TV says, per variant, and the route that address is in this app.
const SAYS = {
  a: { typed: `${HOST}/join`, path: '/join', surface: 'nokod-390' },
  b: { typed: HOST, path: '/', surface: 'start-390' },
  c: { typed: `${HOST}/${code}`, path: `/join?code=${code}`, surface: null },
  d: { typed: `${HOST}/join`, path: '/join', surface: 'nokod-390' },
}
const out = {}
for (const [v, say] of Object.entries(SAYS)) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'sv-SE' })
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  // The phone never opens /play's socket, so the seat it bought is a reservation that lapses after
  // two minutes (DRIFT §9) and the table is the same for the next variant and for shoot.mjs.
  await ctx.route(/\/play\?/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>/play</p>' }))
  const page = await ctx.newPage()
  let loads = 0
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) loads++ })
  let chars = say.typed.length
  let presses = 1 // «Gå» on the address bar
  await page.goto(links.origin + say.path)
  if (say.surface) {
    await page.locator('h1, .byd-login').first().waitFor()
    await page.waitForTimeout(600)
    await page.evaluate(PAGE)
    await page.evaluate(`window.__p675.place(${JSON.stringify(v)}, ${JSON.stringify(say.surface)}, ${JSON.stringify({ code, game: "Sal's Saloon" })})`)
    // The boxes take one character each and move on by themselves, as such a field does.
    const boxes = page.locator('.p675-boxes input')
    if (await boxes.count()) for (let i = 0; i < 6; i++) await boxes.nth(i).fill(code[i])
    else await page.locator('[data-m=field]:visible').first().fill(code)
    chars += code.length
    await page.locator('[data-m=go]:visible').first().click()
    presses++
  }
  await page.locator('.byd-join-table button').first().waitFor({ timeout: 15000 })
  const before = loads
  // One seat per variant, so that a reservation an earlier run left pending is never the one asked for.
  const seat = { a: 'C', b: 'D', c: 'B', d: 'C' }[v]
  await page.locator(`.byd-join-table button[data-seat=${seat}]`).click()
  const name = 'Bea'
  await page.locator('.byd-join-name input').fill(name)
  chars += name.length
  await page.locator('.byd-join form button[type=submit]').click()
  presses++
  await page.waitForURL(/\/play\?/, { timeout: 15000 }).catch(async (e) => {
    console.error(v, page.url(), (await page.locator('body').innerText()).slice(0, 400))
    throw e
  })
  out[v] = { typed: say.typed, loadsToPicker: before, chars, presses, landed: new URL(page.url()).pathname, seat: new URL(page.url()).searchParams.get('seat') }
  await ctx.close()
  // Two runs, then a wait long enough for every reservation left pending to lapse.
  if (v === 'b') await new Promise((r) => setTimeout(r, 130_000))
}
console.log(JSON.stringify(out, null, 2))
await browser.close()

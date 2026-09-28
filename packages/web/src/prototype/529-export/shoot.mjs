// PROTOTYPE — throwaway (#529). node shoot.mjs <links.json> <outdir>
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const [linksFile, out] = process.argv.slice(2)
const links = JSON.parse(readFileSync(linksFile, 'utf8'))
mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'sv-SE', acceptDownloads: true })
const login = await context.request.post(`${links.api}/auth/login`, { data: { email: 'lasbarhet@example.com' } })
console.log('login', login.status())
// A real export to import back, and a broken one.
await context.request.post(`${links.api}/projects/lasbarhet/export`)
let zip
for (let i = 0; i < 120; i++) {
  const res = await context.request.get(`${links.api}/projects/lasbarhet/export`)
  if (res.status() === 200) { zip = await res.body(); break }
  await new Promise((r) => setTimeout(r, 500))
}
writeFileSync(`${out}/good.zip`, zip)
writeFileSync(`${out}/broken.zip`, Buffer.concat([zip.subarray(0, 2000), Buffer.from('trasig')]))
const home = (v) => `${links.web}/?server=${encodeURIComponent(links.api)}&variant=${v}`
const menu = async (page) => {
  await page.locator('[data-project="lasbarhet"] .byd-home-more').click()
}
for (const v of ['A', 'B', 'C']) {
  const page = await context.newPage()
  await page.goto(home(v))
  await page.waitForSelector('[data-project="lasbarhet"]')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${out}/${v}-1-vila.png` })
  await menu(page)
  await page.screenshot({ path: `${out}/${v}-2-meny.png` })
  await page.locator('[data-proto529-export]').click()
  if (v === 'B') {
    await page.waitForSelector('[data-proto529-dialog]')
    await page.screenshot({ path: `${out}/${v}-3-dialog.png` })
    await page.getByRole('button', { name: 'Förbered export' }).click()
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${out}/${v}-4-forbereder.png` })
    await page.getByRole('button', { name: 'Ladda ner' }).waitFor({ timeout: 60_000 })
    await page.screenshot({ path: `${out}/${v}-5-klar.png` })
    await page.getByRole('button', { name: 'Stäng' }).click()
  } else {
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${out}/${v}-3-forbereder.png` })
    await page.waitForFunction(() => /nedladdad/.test(document.body.innerText), null, { timeout: 60_000 })
    await page.screenshot({ path: `${out}/${v}-4-klar.png` })
  }
  // Import: the broken one first, then the good one.
  if (v === 'B') await page.locator('[data-proto529-import]').click()
  await page.locator('[data-proto529-file]').setInputFiles(`${out}/broken.zip`)
  await page.waitForFunction(() => /kunde inte importeras/i.test(document.body.innerText), null, { timeout: 20_000 })
  await page.screenshot({ path: `${out}/${v}-6-import-fel.png` })
  await page.locator('[data-proto529-file]').setInputFiles(`${out}/good.zip`)
  await page.waitForFunction(() => document.querySelectorAll('[data-project]').length >= 2, null, { timeout: 30_000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: `${out}/${v}-7-importerad.png` })
  if (v === 'C') {
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File(['x'], 'spel.zip', { type: 'application/zip' }))
      window.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    })
    await page.waitForTimeout(150)
    await page.screenshot({ path: `${out}/${v}-8-slapp.png` })
  }
  await page.close()
  // Remove imported copies so each variant starts from one game.
  const list = await (await context.request.get(`${links.api}/projects`)).json()
  for (const p of list) if (p.id !== 'lasbarhet') await context.request.delete(`${links.api}/projects/${p.id}`)
}
await browser.close()

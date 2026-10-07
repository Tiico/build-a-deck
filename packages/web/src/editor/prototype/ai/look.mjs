// PROTOTYP — kastas (#940). Snabbtitt: node look.mjs '<query>' ut.png [bredd] [höjd] [steg…]
// Steg: wait:ms · click:selektor · type:selektor=text · key:Tangent · allt annat körs som JS i sidan.
import { chromium } from 'playwright'
const [query = '', out = 'look.png', w = '1440', h = '900', ...steps] = process.argv.slice(2)
const browser = await chromium.launch()
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// Inloggningen är ström- och adressbegränsad: en kaka sparas och återanvänds.
const state = join(tmpdir(), 'byd-ai-940-state.json')
const context = await browser.newContext({ viewport: { width: Number(w), height: Number(h) }, locale: 'sv-SE', ...(existsSync(state) ? { storageState: state } : {}) })
if (!existsSync(state)) {
  const res = await context.request.post('http://localhost:8317/auth/login', { data: { email: 'prototype@example.com' } })
  if (!res.ok()) throw new Error(`login ${res.status()} ${await res.text()}`)
  await context.storageState({ path: state })
}
const page = await context.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(`http://localhost:5317/editor?project=ux-prototype&server=${encodeURIComponent('http://localhost:8317')}${query}`)
await page.waitForSelector('.byd-editor, .ux-ai-account', { timeout: 30000 }).catch(async (e) => {
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 500)))
  throw e
})
await page.waitForTimeout(1500)
for (const step of steps) {
  if (step.startsWith('wait:')) await page.waitForTimeout(Number(step.slice(5)))
  else if (step.startsWith('click:')) await page.click(step.slice(6))
  else if (step.startsWith('type:')) { const [sel, ...rest] = step.slice(5).split('='); await page.fill(sel, rest.join('=')) }
  else if (step.startsWith('key:')) await page.keyboard.press(step.slice(4))
  else console.log('eval', JSON.stringify(await page.evaluate(step)))
}
await page.screenshot({ path: out })
console.log(errors.join('\n'))
await browser.close()

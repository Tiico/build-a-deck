// PROTOTYP — kastas (#940). Alla bilder till galleriet, mot riggen på 8317/5317:
//   node src/editor/prototype/ai/shoot.mjs <utkatalog> [namnfilter]
// Körs från packages/web så att playwright hittas.
import { chromium } from 'playwright'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [out = 'bilder', only = ''] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const SIZES = [
  [1440, 900],
  [1280, 800],
]
const go = '.ux-ai-ask button[type=submit]'
const first = '.ux-ai-suggest li:first-child button'
// [namn, query, steg, bara vid 1440]
const SHOTS = [
  ['A-vilar', '&ai=A', []],
  ['A-strommar', '&ai=A', [['click', first], ['wait', 2400]]],
  ['A-forslag', '&ai=A', [['click', first], ['wait', 7600], ['click', '.ux-ai-proposal .ux-ai-row button.byd-secondary'], ['wait', 1200]]],
  ['A-utan-nyckel', '&ai=A&nyckel=0', []],
  ['A-utan-nyckel-oppen', '&ai=A&nyckel=0', [['click', '.ux-ai-rail'], ['wait', 300]]],
  ['B-vilar', '&ai=B', []],
  ['B-strommar', '&ai=B', [['click', '.ux-ai-act'], ['wait', 300], ['click', go], ['wait', 2400]]],
  ['B-forslag', '&ai=B', [['click', '.ux-ai-act'], ['wait', 300], ['click', go], ['wait', 7600]]],
  ['B-utan-nyckel', '&ai=B&nyckel=0', [['click', '.ux-ai-act'], ['wait', 400]]],
  ['C-vilar', '&ai=C', []],
  ['C-strommar', '&ai=C', [['click', go], ['wait', 3300]]],
  ['C-forslag', '&ai=C', [['click', go], ['wait', 7600], ['click', '.ux-ai-bar .ux-ai-link'], ['wait', 1400], ['click', '.byd-wall-card[data-card-ref="los-planka"] .ux-ai-ghost-keep'], ['wait', 300]]],
  ['C-utan-nyckel', '&ai=C&nyckel=0', []],
  ['nyckel-tom', '&ai=nyckel&nyckel=0', []],
  ['nyckel-sparad', '&ai=nyckel', []],
  // Bara vid 1440: det som visar resten av frågan.
  ['A-fel-nyckel', '&ai=A&utfall=nyckel', [['click', first], ['wait', 1600]], true],
  ['A-godtaget', '&ai=A', [['click', first], ['wait', 7600], ['click', '.ux-ai-decide .byd-primary'], ['wait', 900]], true],
  ['A-mall', '&ai=A', [['click', '.ux-ai-suggest li:nth-child(2) button'], ['wait', 6500], ['click', '.ux-ai-proposal .ux-ai-row button.byd-secondary'], ['wait', 1500], ['click', '.byd-wall-jump :text-is("Shopcard")'], ['wait', 900]], true],
  ['B-mall', '&ai=B', [['click', '#byd-editor-tab-template'], ['wait', 900], ['click', '.ux-ai-act'], ['wait', 400], ['click', go], ['wait', 6500]], true],
  ['B-kolumn', '&ai=B', [['click', '#byd-editor-tab-table'], ['wait', 900], ['eval', "document.querySelector('.byd-data-scroll').scrollLeft = 4000"], ['wait', 300], ['eval', "document.querySelector('th[data-col=\"antal\"] .ux-ai-head').click()"], ['wait', 400], ['click', go], ['wait', 5000]], true],
  ['B-avbrutet', '&ai=B', [['click', '.ux-ai-act'], ['wait', 300], ['click', go], ['wait', 1800], ['key', 'Escape'], ['wait', 300]], true],
  ['C-tabell', '&ai=C', [['click', go], ['wait', 7600], ['click', '#byd-editor-tab-table'], ['wait', 1200]], true],
  ['C-oanvandbart', '&ai=C&utfall=oanvandbart', [['click', go], ['wait', 7800]], true],
  ['C-forfina', '&ai=C', [['click', go], ['wait', 7600], ['click', '.ux-ai-bar button:has-text("Förfina…")'], ['wait', 200], ['type', '.ux-ai-refine input', 'Gör dem mildare'], ['click', '.ux-ai-refine button'], ['wait', 1500]], true],
  ['C-308-kort', '&ai=C&skala=4', [['click', go], ['wait', 7800], ['click', '.ux-ai-bar .ux-ai-link'], ['wait', 1600]], true],
  ['nyckel-provar', '&ai=nyckel&nyckel=0', [['type', '.ux-ai-key input[type=password]', 'sk-ant-api03-prototyp-abcd'], ['click', '.ux-ai-key button[type=submit]'], ['wait', 400]], true],
  ['nyckel-fel', '&ai=nyckel&nyckel=0', [['type', '.ux-ai-key input[type=password]', 'sk-fel'], ['click', '.ux-ai-key button[type=submit]'], ['wait', 1700]], true],
]

const browser = await chromium.launch()
const state = join(tmpdir(), 'byd-ai-940-state.json')
const server = encodeURIComponent('http://localhost:8317')
for (const [w, h] of SIZES) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, locale: 'sv-SE', ...(existsSync(state) ? { storageState: state } : {}) })
  if (!existsSync(state)) {
    const res = await context.request.post('http://localhost:8317/auth/login', { data: { email: 'prototype@example.com' } })
    if (!res.ok()) throw new Error(`login ${res.status()}`)
    await context.storageState({ path: state })
  }
  for (const [name, query, steps, wideOnly] of SHOTS) {
    if (only && !name.includes(only)) continue
    if (wideOnly && w !== 1440) continue
    const page = await context.newPage()
    const errors = []
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(`http://localhost:5317/editor?project=ux-prototype&server=${server}${query}&ren`)
    await page.waitForSelector('.byd-editor, .ux-ai-account', { timeout: 30000 })
    await page.waitForTimeout(1600)
    for (const [kind, a, b] of steps) {
      if (kind === 'click') await page.click(a)
      else if (kind === 'wait') await page.waitForTimeout(a)
      else if (kind === 'type') await page.fill(a, b)
      else if (kind === 'key') await page.keyboard.press(a)
      else if (kind === 'eval') await page.evaluate(a)
    }
    const file = join(out, `${name}-${w}x${h}.png`)
    await page.screenshot({ path: file })
    console.log(file, errors.length ? `FEL: ${errors.join(' | ').slice(0, 300)}` : '')
    await page.close()
  }
  await context.close()
}
await browser.close()

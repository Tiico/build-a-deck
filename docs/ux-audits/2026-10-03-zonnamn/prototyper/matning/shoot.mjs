// Throwaway driver for the #685 prototype: every surface × variant on the real built app, with the
// variant's placement injected, screenshotted and measured.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const HERE = import.meta.dirname
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PLACE = readFileSync(join(HERE, 'place.js'), 'utf8')
const VARS = () => readFileSync(join(HERE, 'variants.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
const ONLY = process.argv[4] ? process.argv[4].split(',') : null
const SEATS = (process.argv[5] ?? '4,8').split(',')
mkdirSync(OUT, { recursive: true })

const SURFACES = [
  { id: 'tv-1920', url: 'tvUrl', w: 1920, h: 1080 },
  { id: 'bord-1024', url: 'tableUrl', w: 1024, h: 768 },
  { id: 'bord-1280', url: 'tableUrl', w: 1280, h: 800 },
  { id: 'bord-1440', url: 'tableUrl', w: 1440, h: 900 },
  { id: 'online-1280', url: 'onlineUrl', w: 1280, h: 800 },
  { id: 'editor-1024', url: 'editorUrl', w: 1024, h: 768, editor: true },
  { id: 'editor-1280', url: 'editorUrl', w: 1280, h: 800, editor: true },
  { id: 'editor-1440', url: 'editorUrl', w: 1440, h: 900, editor: true },
  { id: 'obs-390', url: 'observeUrl', w: 390, h: 844, phone: true },
  { id: 'obs-768', url: 'observeUrl', w: 768, h: 1024, phone: true },
]

const browser = await chromium.launch()
const results = []
for (const seats of SEATS) {
  const t = links.tables[`p${seats}`]
  for (const s of SURFACES) {
    if (ONLY && !ONLY.includes(s.id)) continue
    const context = await browser.newContext({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1, locale: 'sv-SE', ...(s.phone ? { hasTouch: true, isMobile: true } : {}) })
    await context.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
    const page = await context.newPage()
    await page.goto(links.origin + t[s.url])
    if (s.editor) {
      await page.locator('#byd-editor-tab-tables').click()
      await page.locator('.byd-setup-felt [data-zone-handle="market"]').waitFor({ state: 'attached' })
    } else {
      await page.locator('.byd-zone').first().waitFor({ state: 'attached', timeout: 20000 })
    }
    // Every texture in, or twenty seconds: the labels do not depend on it, the pictures do.
    await page.waitForFunction(() => document.querySelectorAll('.byd-texture-state').length === 0, null, { timeout: 20000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
    if (s.editor) await page.evaluate(() => document.querySelectorAll('.byd-setup-felt .byd-zone').forEach((z) => z.setAttribute('data-lit', '')))
    await page.mouse.move(0, 0)
    await page.evaluate(VARS())
    for (const v of VARIANTS) {
      const m = await page.evaluate(`(${PLACE})(${JSON.stringify(v)})`)
      const file = `${v}-${s.id}-${seats}.png`
      await page.screenshot({ path: join(OUT, file) })
      results.push({ variant: v, surface: s.id, seats, file, ...m })
      console.log(v, s.id, seats, JSON.stringify({ inZone: m.inZone, pairs: m.pairs, badges: m.badges, smallest: m.smallest, cut: m.cut, outside: m.outside, wide: m.wide, scale: m.scale }))
    }
    // The Bord tab lights one zone at a time (#581): the same reading, zone by zone.
    if (s.editor) {
      const areas = await page.evaluate(() => [...document.querySelectorAll('.byd-setup-felt .byd-zone')].map((z) => z.dataset.area))
      for (const v of VARIANTS) {
        const solo = { inZone: [], pairs: [], badges: [], cut: [], outside: [], wide: { inZone: 0, badges: 0, cut: 0 } }
        for (const a of areas) {
          await page.evaluate((a) => document.querySelectorAll('.byd-setup-felt .byd-zone').forEach((z) => (z.dataset.area === a ? z.setAttribute('data-lit', '') : z.removeAttribute('data-lit'))), a)
          const m = await page.evaluate(`(${PLACE})(${JSON.stringify(v)})`)
          for (const k of ['inZone', 'pairs', 'badges', 'cut', 'outside']) solo[k].push(...m[k])
          for (const k of ['inZone', 'badges', 'cut']) solo.wide[k] += m.wide[k]
        }
        results.push({ variant: v, surface: s.id + '-en', seats, file: null, ...solo, overPile: [], overHand: [], underCard: [], smallest: 11 })
        console.log(v, s.id + '-en', seats, JSON.stringify(solo))
      }
    }
    await context.close()
  }
}
writeFileSync(join(OUT, 'results.json'), JSON.stringify(results, null, 2))
await browser.close()
process.exit(0)

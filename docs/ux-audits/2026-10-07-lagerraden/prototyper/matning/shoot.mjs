// Throwaway driver for the #699 prototype: the Mall tab's layer list in the real built editor on
// the e2e stack, at 1440, 1280 and 1024, on Sal's Saloon (the base, and the group «typ = Effect»)
// and on two decks whose conditions differ only by a long value, in Swedish and in English. Each
// variant is injected by page.js, measured at the machine's font and at +15 % (DejaVu on Linux),
// tried from the keyboard and shot.
//
//   node shoot.mjs <ut-katalog> nu,a,b,c,d [ytor] [bredder]
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c,d').split(',')
const SURFACES = {
  sal: { project: links.sal, lang: 'sv', select: 'if-karaktar' },
  grupp: { project: links.sal, lang: 'sv', select: 'if-karaktar', group: 'Effect' },
  langa: { project: links.longSv, lang: 'sv', select: 'if-3' },
  long: { project: links.longEn, lang: 'en', select: 'if-3' },
}
const SIZES = { 1440: 900, 1280: 800, 1024: 768 }
const SURF = (process.argv[4] ?? Object.keys(SURFACES).join(',')).split(',')
const WIDTHS = (process.argv[5] ?? '1440,1280,1024').split(',').map(Number)
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const results = []
for (const s of SURF) for (const w of WIDTHS) for (const v of VARIANTS) {
  const S = SURFACES[s]
  const ctx = await browser.newContext({ viewport: { width: w, height: SIZES[w] }, deviceScaleFactor: 2, locale: S.lang === 'sv' ? 'sv-SE' : 'en-GB' })
  await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  await ctx.addInitScript((lang) => { try { localStorage.setItem('byd.lang', lang) } catch {} }, S.lang)
  const page = await ctx.newPage()
  await page.goto(`${links.origin}/editor?project=${encodeURIComponent(S.project)}`)
  await page.locator('#byd-editor-tab-template').click()
  await page.locator('.byd-layers [role="row"]').first().waitFor()
  if (S.group) {
    await page.locator('.byd-canvas-group-open').click()
    await page.locator('.byd-canvas-groups [role="menuitem"], .byd-canvas-groups [role="menuitemradio"]').filter({ hasText: S.group }).first().click()
    await page.locator('.byd-layer-source').first().waitFor()
  }
  await page.locator(`[data-layer="${S.select}"] .byd-layer-pick`).click()
  await page.waitForTimeout(500)
  await page.mouse.move(w - 5, SIZES[w] - 5)
  await page.evaluate(PAGE)
  await page.evaluate(`window.__p699.place(${JSON.stringify(v)})`)
  await page.waitForTimeout(150)
  const m = await page.evaluate('window.__p699.measure(1)')
  const wide = await page.evaluate('window.__p699.measure(1.15)')
  await page.evaluate('window.__p699.fitB(1)')
  // Blur whatever the click focused, so no ring is in the picture.
  await page.evaluate(() => document.activeElement?.blur())
  const col = page.locator('.byd-canvas-layers')
  const box = await col.boundingBox()
  const file = `${v}-${s}-${w}`
  // The column, down to where its list and the groups end (not the empty rest of the viewport).
  const end = await page.evaluate(() => {
    const list = document.querySelector('.byd-canvas-scroll')
    const kids = [...(list?.children ?? [])].map((c) => c.getBoundingClientRect().bottom)
    const foot = document.querySelector('.byd-canvas-layers > .byd-canvas-hint')?.getBoundingClientRect().bottom ?? 0
    return Math.max(...kids.filter((b) => b < innerHeight), foot)
  })
  await page.screenshot({ path: join(OUT, `${file}-col.png`), clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, end - box.y + 8) } })
  // The canvas tab and the properties heading next to the list: the top of the three columns.
  if (w === 1280 && (s === 'sal' || s === 'langa' || s === 'long')) {
    await page.screenshot({ path: join(OUT, `${file}-frame.png`), clip: { x: box.x, y: 0, width: w - box.x, height: SIZES[w] } })
  }
  // The keyboard: into the grid on the chosen layer, one row down, and what is said there.
  await page.locator(`[data-layer="${S.select}"] .byd-layer-pick`).focus()
  await page.keyboard.press('ArrowDown')
  const down = await page.evaluate(() => {
    const a = document.activeElement
    return { layer: a?.closest('[role="row"]')?.getAttribute('data-layer') ?? null, said: a?.getAttribute('aria-label') ?? (a?.textContent ?? '').replace(/\s+/g, ' ').trim() }
  })
  const aria = await page.locator('.byd-layers').ariaSnapshot()
  results.push({ v, s, w, file, ...m, wide: { distinct: wide.distinct, valuesSeen: wide.valuesSeen, rows: wide.rows.map((r) => ({ id: r.id, visible: r.visible, cut: r.cut, lines: r.lines, h: r.h })), rowH: wide.rowH, listH: wide.listH }, down, aria })
  console.log(v, s, w, `distinct ${m.distinct}/${m.conds} values ${m.valuesSeen} · +15% ${wide.distinct}/${wide.valuesSeen} · rowH ${m.rowH} · names ${m.names?.count}`)
  await ctx.close()
}
writeFileSync(join(OUT, `results-${VARIANTS.join('_')}-${SURF.join('_')}-${WIDTHS.join('_')}.json`), JSON.stringify(results, null, 2))
await browser.close()

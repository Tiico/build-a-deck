// Throwaway driver for the #1010 prototype: where the designer reads the playtest's answers. The
// real built editor on the e2e stack, logged in as the game's owner, with the data seed.mts made
// through the server. Each variant is injected by page.js, which reads the answers and flags from
// the server itself; the surface is reached the way a designer reaches it (the Bord tab and its
// «Avslutade bord» fold, the version button that opens the history, a version in it), shot at
// the window's size and again at a height where nothing in the variant scrolls, and its
// accessibility tree is written down.
//
//   node shoot.mjs <ut-katalog> [nu,a,b,c] [tom,utan,manga,versioner] [1280,1440]
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const L = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const S = JSON.parse(readFileSync(join(HERE, 'seed.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c').split(',')
const STATES = (process.argv[4] ?? 'tom,utan,manga,versioner').split(',')
const SIZES = (process.argv[5] ?? '1280,1440').split(',').map((w) => ({ 1280: { w: 1280, h: 800 }, 1440: { w: 1440, h: 900 } })[w])
mkdirSync(OUT, { recursive: true })

// Which version a variant that lives in the history opens, per state.
const OPEN_REV = { tom: 1, utan: S.first, manga: S.first, versioner: S.second }
// Where «Nu» is looked at: the Bord tab, where the ended tables are, and — for the versions — the
// history, where a version is.
const surfaceOf = (v, s) => (v === 'c' || (v === 'nu' && s === 'versioner') ? 'history' : v === 'b' ? 'tab' : 'tables')

const browser = await chromium.launch()
const results = []
for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.w, height: size.h }, deviceScaleFactor: 2, locale: 'sv-SE' })
  await ctx.addCookies([{ name: 'byd_session', value: L.cookie.split('=')[1], url: L.origin }])
  for (const s of STATES) {
    for (const v of VARIANTS) {
      const page = await ctx.newPage()
      const project = s === 'tom' ? S.empty.project : S.project
      await page.goto(`${L.origin}/editor?project=${encodeURIComponent(project)}`)
      await page.locator('.byd-wall-card').first().waitFor({ timeout: 30_000 })
      await page.evaluate('document.fonts.ready.then(() => undefined)')
      await page.evaluate(PAGE)
      const model = await page.evaluate('window.__p1010.load()')
      const surface = surfaceOf(v, s)
      if (surface === 'tables') {
        await page.locator('#byd-editor-tab-tables').click()
        await page.locator('.byd-tables').waitFor()
        const fold = page.locator('#byd-tables-group-ended')
        if (await fold.count()) await fold.click()
        // The rows connect and say their codes; an ended row's code comes over its own socket.
        await page.waitForFunction('[...document.querySelectorAll(".byd-table-row")].every((r) => r.querySelector(".byd-tables-name"))', null, { timeout: 15_000 }).catch(() => undefined)
      } else if (surface === 'history') {
        await page.locator('.byd-editor-rev').click()
        await page.locator('.byd-history li[data-rev]').first().waitFor()
        await page.waitForFunction('!document.querySelector(".byd-history li[data-waiting]")', null, { timeout: 10_000 }).catch(() => undefined)
        await page.locator(`.byd-history li[data-rev="${OPEN_REV[s]}"] > button`).click()
        await page.waitForTimeout(400)
      }
      await page.waitForTimeout(1500)
      await page.mouse.move(size.w - 4, size.h - 4)
      const root = await page.evaluate(`window.__p1010.place(${JSON.stringify(v)}, ${JSON.stringify(s)})`)
      await page.waitForTimeout(400)
      const sel = root ?? (surface === 'history' ? '.byd-history' : surface === 'tables' ? '.byd-tables' : 'main')
      const file = `${v}-${s}-${size.w}`
      await page.screenshot({ path: join(OUT, `${file}-full.png`) })
      // What the variant holds against what shows of it in this window: the scroll containers in
      // it, and how much each hides.
      const measure = () =>
        page.evaluate((q) => {
          const r = document.querySelector(q)
          const boxes = [r, ...r.querySelectorAll('*')].filter((e) => {
            const cs = getComputedStyle(e)
            return /(auto|scroll)/.test(cs.overflowY) && e.scrollHeight > e.clientHeight + 2
          })
          const b = r.getBoundingClientRect()
          return { rect: { x: b.x, y: b.y, w: b.width, h: b.height }, hidden: Math.max(0, ...boxes.map((e) => e.scrollHeight - e.clientHeight)), content: Math.max(b.height, ...boxes.map((e) => e.scrollHeight)) }
        }, sel)
      const m = await measure()
      // The header: does the tab strip still hold every tab in one row without running under the
      // buttons beside it?
      const header = await page.evaluate(() => {
        const nav = document.querySelector('nav[role="tablist"]')
        const tabs = [...nav.querySelectorAll('[role="tab"]')].map((t) => t.getBoundingClientRect())
        const n = nav.getBoundingClientRect()
        const rows = new Set(tabs.map((t) => Math.round(t.y))).size
        const right = [...document.querySelectorAll('header button, header a')].filter((e) => !nav.contains(e) && !e.closest('.byd-history')).map((e) => e.getBoundingClientRect()).filter((r) => r.x > n.x)
        const gap = right.length ? Math.round(Math.min(...right.map((r) => r.x)) - n.right) : null
        // Whatever in the header has to give way for the strip: the game's name ellipsised, say.
        const cut = [...document.querySelectorAll('header *')].filter((e) => !e.closest('.byd-history') && getComputedStyle(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth + 1).map((e) => `${e.textContent.trim()} (${e.clientWidth}/${e.scrollWidth} px)`)
        return { tabs: tabs.length, rows, clipped: nav.scrollWidth > nav.clientWidth + 1, gap, width: Math.round(n.width), cut }
      })
      const tree = size.w === 1280 ? await page.locator(sel).first().ariaSnapshot().catch((e) => `(${e.message})`) : null
      // The same variant on a window tall enough that nothing in it scrolls: the whole of what it
      // says, as one picture.
      let tall = size.h
      for (let i = 0; i < 6; i++) {
        const now = await measure()
        if (now.hidden <= 2 || tall >= 6000) break
        tall = Math.min(6000, Math.ceil(tall + now.hidden * (surface === 'history' ? 1.5 : 1) + 24))
        await page.setViewportSize({ width: size.w, height: tall })
        await page.waitForTimeout(350)
      }
      const t = await measure()
      await page.screenshot({ path: join(OUT, `${file}-crop.png`), clip: { x: Math.max(0, t.rect.x - 8), y: Math.max(0, t.rect.y - 8), width: Math.min(size.w - Math.max(0, t.rect.x - 8), t.rect.w + 16), height: Math.min(tall, t.rect.h + 16) } })
      results.push({ v, s, w: size.w, h: size.h, file, surface, root: sel, rect: m.rect, hidden: Math.round(m.hidden), content: Math.round(m.content), tall, header, tree, model })
      console.log(file, 'rect', Math.round(m.rect.w), '×', Math.round(m.rect.h), 'hidden', Math.round(m.hidden), 'tall', tall, 'tabs', JSON.stringify(header))
      await page.close()
    }
  }
  await ctx.close()
}
writeFileSync(join(OUT, `results-${VARIANTS.join('_')}-${STATES.join('_')}-${SIZES.map((x) => x.w).join('_')}.json`), JSON.stringify(results, null, 2))
await browser.close()

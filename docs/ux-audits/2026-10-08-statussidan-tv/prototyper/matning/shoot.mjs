// Engångsdrivare för prototypen till #925: D5:s statussida på /table i det byggda appen, på TV:n
// vid 1280 × 720 och 1920 × 1080 och i bordsläget vid 1280 × 800, i fem lägen:
//
// - laddar och dröjer: skalet (#749), med appens skript stoppade så att skalet står kvar;
// - nätfel: appen, med bordets WebSocket hållen öppen utan svar tills tidsgränsen går;
// - saknas: ett bord servern aldrig hört talas om;
// - slut: ett bord som avslutats med `session.end`.
//
// Varje läge ritas en gång och varje variant läggs ovanpå (varianter.mjs) och fotograferas och mäts.
//
//   node shoot.mjs [ut-katalog]
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { VARIANTS, css } from './varianter.mjs'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const OUT = process.argv[2] ?? join(HERE, '..', 'img')
mkdirSync(OUT, { recursive: true })

const SCREENS = [
  { key: 'tv1280', yta: 'tv', w: 1280, h: 720 },
  { key: 'tv1920', yta: 'tv', w: 1920, h: 1080 },
  { key: 'bord1280', yta: 'table', w: 1280, h: 800 },
]
const STATES = ['loading', 'slow', 'offline', 'missing', 'shut', 'ended']
const CSS = css()

const browser = await chromium.launch()
const results = []
for (const S of SCREENS) {
  for (const state of STATES) {
    const ctx = await browser.newContext({ viewport: { width: S.w, height: S.h }, deviceScaleFactor: 1, locale: 'sv-SE' })
    await ctx.addInitScript(
      ([yta, rules]) => {
        document.documentElement.dataset.yta = yta
        document.documentElement.dataset.v = 'nu'
        const put = () => {
          if (document.getElementById('proto925')) return
          const style = document.createElement('style')
          style.id = 'proto925'
          style.textContent = rules
          ;(document.head ?? document.documentElement).append(style)
        }
        const mark = () => {
          document.documentElement.dataset.yta = yta
          document.documentElement.dataset.v ??= 'nu'
          put()
        }
        mark()
        document.addEventListener('DOMContentLoaded', mark)
      },
      [S.yta, CSS],
    )
    const shell = state === 'loading' || state === 'slow'
    if (shell) await ctx.route('**/assets/**/*.js', (r) => r.abort())
    const page = await ctx.newPage()
    if (state === 'offline') {
      // The line is taken and never answered, so the table waits, says it is slow, and gives up at
      // the initial connection's time limit (D5) — the same page a dead server gives.
      await page.routeWebSocket('**/sessions/**', () => undefined)
    }
    // A wrong host key on a live table is D5's «stängt» (401/403) on the table's screen.
    const at = state === 'ended' ? links.ended[S.yta] : state === 'missing' ? links.missing[S.yta] : state === 'shut' ? links.live[S.yta].replace(/host=[^&]*/, 'host=fel') : links.live[S.yta]
    await page.goto(at)
    // An ended table is not a status page on the table's screen: the felt stays, with its summary
    // over it. It is shot as it is, beside the variants, for what it says about the same floor.
    const sel = shell ? '#byd-shell' : state === 'ended' ? '.byd-ended-summary' : state === 'shut' ? ".byd-status[data-surface='page'][data-tone='shut']" : `[data-status-notice='${state}']`
    if (state === 'slow') await page.waitForFunction(() => performance.now() > 4600)
    else if (state === 'loading') await page.waitForTimeout(600)
    await page.locator(sel).waitFor({ timeout: 40_000 })
    await page.waitForTimeout(300)
    await page.evaluate(([yta, rules]) => {
      document.documentElement.dataset.yta = yta
      document.getElementById('proto925')?.remove()
      const style = document.createElement('style')
      style.id = 'proto925'
      style.textContent = rules
      document.head.append(style)
    }, [S.yta, CSS])
    for (const v of state === 'ended' ? ['nu'] : Object.keys(VARIANTS)) {
      await page.evaluate((v) => (document.documentElement.dataset.v = v), v)
      await page.waitForTimeout(80)
      const file = `${v}-${S.key}-${state}.jpg`
      await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 82, animations: 'disabled' })
      const m = await page.evaluate((sel) => {
        const root = sel === '.byd-ended-summary' ? document.querySelector(sel).parentElement : document.querySelector(sel)
        const px = (el) => (el ? Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10 : null)
        const words = [...root.querySelectorAll('.byd-status-mark, .m, h1, p, .byd-status-act, button')]
        const shown = words.filter((el) => el.getClientRects().length > 0 && !el.closest('noscript') && !el.hidden && el.textContent.trim() !== '')
        const sizes = shown.map((el) => parseFloat(getComputedStyle(el).fontSize))
        const kids = [...root.children].filter((el) => el.getClientRects().length > 0 && !el.hidden && el.tagName !== 'NOSCRIPT')
        const top = Math.min(...kids.map((el) => el.getBoundingClientRect().top))
        const bottom = Math.max(...kids.map((el) => el.getBoundingClientRect().bottom))
        const right = Math.max(...kids.map((el) => el.getBoundingClientRect().right))
        const h1 = root.querySelector('h1, h2') ?? root
        const lh = parseFloat(getComputedStyle(h1).lineHeight)
        return {
          mark: px(root.querySelector('.byd-status-mark, .m')),
          heading: px(h1),
          headingTag: h1.tagName,
          text: px(root.querySelector('p')),
          button: px(root.querySelector('.byd-status-act, button:not([hidden])')),
          smallest: Math.min(...sizes),
          headingLines: Math.round(h1.getBoundingClientRect().height / lh),
          heading$: h1.textContent,
          block: Math.round(bottom - top),
          top: Math.round(top),
          right: Math.round(right),
          fits: top >= 0 && bottom <= innerHeight && right <= innerWidth,
        }
      }, sel)
      results.push({ v, screen: S.key, yta: S.yta, w: S.w, h: S.h, state, file, ...m })
      console.log(file, JSON.stringify(m))
    }
    await ctx.close()
  }
}
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på det byggda appen.\nwindow.MATT = ${JSON.stringify(results)}\n`)
await browser.close()
process.exit(0)

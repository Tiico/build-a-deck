// PROTOTYP — kastas (#1019). Öppnar Kortväggen i den byggda editorn på e2e-stacken, lägger varje
// variant ovanpå den riktiga kronan med page.js, mäter raden och kontrollen och fotograferar.
//
//   node shoot.mjs <ut-katalog> nu,a,b,c,d [ytor]
//
// En yta är <bredd>[-ai]-<sv|en>-<mac|bred>-<oppen|ihop>[-x1]: 1100-sv-mac-oppen,
// 1280-ai-en-bred-ihop. «-ai» är AI-panelen öppen bredvid väggen; «bred» är kronans text i Verdana
// (DejaVus bredd, som på CI:s Linux); «-x1» mäter kontrasten på en skärm med 1 bildpunkt per px.
// Kontrasten mäts på de målade bildpunkterna, inte på deklarationerna.
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c,d').split(',')
const H = { 1100: 800, 1280: 800, 1440: 900 }
const ALL = []
for (const w of ['1100', '1280', '1440', '1280-ai', '1440-ai']) for (const l of ['sv', 'en']) for (const f of ['mac', 'bred']) for (const o of ['oppen', 'ihop']) ALL.push(`${w}-${l}-${f}-${o}`)
for (const w of ['1100', '1280-ai']) for (const o of ['oppen', 'ihop']) ALL.push(`${w}-sv-mac-${o}-x1`)
const SURF = (process.argv[4] ?? ALL.join(',')).split(',')
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

// Painted pixels: the control and 6 px of what it stands on, read back in a page of its own.
const lab = await (await browser.newContext()).newPage()
const paint = async (png, dpr, borderless) =>
  lab.evaluate(
    async ({ src, dpr, borderless }) => {
      const img = new Image()
      img.src = src
      await img.decode()
      const cv = document.createElement('canvas')
      cv.width = img.width
      cv.height = img.height
      const g = cv.getContext('2d')
      g.drawImage(img, 0, 0)
      const d = g.getImageData(0, 0, cv.width, cv.height).data
      const at = (x, y) => { const i = (y * cv.width + x) * 4; return [d[i], d[i + 1], d[i + 2]] }
      const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      const L = ([r, gg, b]) => 0.2126 * lin(r) + 0.7152 * lin(gg) + 0.0722 * lin(b)
      const ratio = (a, b) => { const x = L(a), y = L(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
      const hex = (c) => '#' + c.map((n) => n.toString(16).padStart(2, '0')).join('')
      const mode = (pts) => { const m = new Map(); for (const p of pts) { const k = p.join(','); m.set(k, (m.get(k) ?? 0) + 1) } return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number) }
      const P = 6 * dpr
      const W = cv.width, Hh = cv.height
      const inner = [], outside = [], edge = []
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
        const inCtl = x >= P && x < W - P && y >= P && y < Hh - P
        if (!inCtl) { if (y < P - dpr || y >= Hh - P + dpr || x < P - dpr || x >= W - P + dpr) outside.push(at(x, y)); continue }
        if (x >= P + 3 * dpr && x < W - P - 3 * dpr && y >= P + 3 * dpr && y < Hh - P - 3 * dpr) inner.push(at(x, y))
        // The top edge's middle, where a border is a straight line and no corner rounds it.
        if (y < P + 2 * dpr && x > W * 0.3 && x < W * 0.7) edge.push(at(x, y))
      }
      const ground = mode(inner)
      const out = mode(outside)
      let ink = ground
      for (const p of inner) if (ratio(p, ground) > ratio(ink, ground)) ink = p
      let line = out
      for (const p of edge) if (ratio(p, out) > ratio(line, out)) line = p
      return {
        ground: hex(ground), outside: hex(out), ink: hex(ink), line: borderless ? null : hex(line),
        inkRatio: +ratio(ink, ground).toFixed(2),
        lineRatio: borderless ? null : +ratio(line, out).toFixed(2),
      }
    },
    { src: 'data:image/png;base64,' + png.toString('base64'), dpr, borderless },
  )

const results = []
for (const s of SURF) for (const v of VARIANTS) {
  const parts = s.split('-')
  const w = Number(parts[0])
  const ai = parts[1] === 'ai'
  const [lang, font, fold] = parts.slice(ai ? 2 : 1)
  const x1 = s.endsWith('-x1')
  const dpr = x1 ? 1 : 2
  const acct = ai ? links.ai : links.utan
  const ctx = await browser.newContext({ viewport: { width: w, height: H[w] }, deviceScaleFactor: dpr, locale: lang === 'sv' ? 'sv-SE' : 'en-GB' })
  const [name, value] = acct.cookie.split('=')
  await ctx.addCookies([{ name, value, url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  await ctx.addInitScript(({ lang, open }) => {
    try {
      localStorage.setItem('byd.lang', lang)
      localStorage.setItem('byd.wall.jump', open ? '1' : '0')
      localStorage.removeItem('byd.ai.panel')
    } catch {}
  }, { lang, open: fold === 'oppen' })
  const page = await ctx.newPage()
  await page.goto(links.origin + acct.url)
  await page.locator('.byd-wall-card').first().waitFor()
  await page.locator('.byd-wall-view .byd-crown-fold').waitFor()
  if (ai) await page.locator('.byd-ai[data-open]').waitFor()
  await page.waitForTimeout(700)
  await page.evaluate(PAGE)
  if (font === 'bred') await page.evaluate('window.__p1019.wide()')
  await page.evaluate(`window.__p1019.place(${JSON.stringify(v)}, ${JSON.stringify(lang)})`)
  await page.mouse.move(w / 2, H[w] - 4)
  await page.waitForTimeout(400)
  const m = await page.evaluate('window.__p1019.measure()')
  const sel = await page.evaluate('window.__p1019.control()')
  const said = await page.locator(sel).ariaSnapshot()
  const r = m.rect
  const clip = { x: r.x - 6, y: r.y - 6, width: r.w + 12, height: r.h + 12 }
  const c = await paint(await page.screenshot({ clip }), dpr, v === 'c')
  const file = x1 ? null : `${v}-${s}.png`
  if (file) await page.screenshot({ path: join(OUT, file) })
  results.push({ v, s, file, dpr, winW: w, said: said.replace(/^- /, '').trim(), ...m, ...c })
  console.log(v, s, `rader ${m.rows} marginal ${m.headroom}`, `${m.foldW}×${m.foldH}`, `«${m.foldText}»`, `bläck ${c.inkRatio}:1 kant ${c.lineRatio}`, said.replace(/\n/g, ' '))
  await ctx.close()
}
writeFileSync(join(OUT, `results-${Date.now()}.json`), JSON.stringify(results, null, 1))
await browser.close()
process.exit(0)

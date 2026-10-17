// Throwaway driver for the #808 prototype: a card whose rules text does not fit even at the
// smallest size E6 allows, in the real built app on the e2e stack — the guided start at 1280 and at
// 390, the same with the dark frame, and the game it makes in the editor's Mall tab and on the card
// wall. Each variant is injected by page.js, measured on painted pixels, and shot.
//
//   node shoot.mjs <ut-katalog> [nu,a,b,c,d] [guide,guide390,guidemork,mall,vagg]
import { chromium } from '@playwright/test'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..', '..', '..', '..')
const { PNG } = createRequire(import.meta.url)(join(ROOT, 'node_modules', '.pnpm', 'pngjs@5.0.0', 'node_modules', 'pngjs'))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c,d').split(',')
const SURF = (process.argv[4] ?? 'guide,guide390,guidemork,mall,vagg').split(',')
const PROJECT = join(HERE, 'tmp-project.txt')
mkdirSync(OUT, { recursive: true })

// A rules text a designer could paste in: about half as long again as the box holds at 6 pt.
const BODY =
  'När du spelar det här kortet: dra två kort och kasta ett. Om du har fler än tre kort på hand får du lägga ett under draghögen. ' +
  'Motståndaren till vänster visar sitt översta kort, och du väljer om det ska ligga kvar. Varje spelare som har ett kort med en sköld ' +
  'får behålla ett kort extra på handen till nästa runda, och den som har flest kvar när högen tar slut vinner. Om två spelare har lika ' +
  'många kort delar de segern, men bara om ingen av dem har spelat en fälla under rundan. En fälla som ligger öppen när högen tar slut ' +
  'räknas som ett kort mindre. Den som drar det sista kortet ur högen får välja vilken spelare som börjar nästa runda, och den spelaren ' +
  'får inte spela en fälla i sitt första drag.'

const SURFACES = {
  guide: { w: 1280, h: 800, frame: 'Klassisk' },
  guide390: { w: 390, h: 844, frame: 'Klassisk', phone: true },
  guidemork: { w: 1280, h: 800, frame: 'Mörk' },
  mall: { w: 1280, h: 800, editor: 'template' },
  vagg: { w: 1280, h: 800, editor: 'wall' },
}

async function guide(page, S) {
  await page.goto(`${links.origin}/new`)
  await page.getByLabel('Spelets namn').fill('Skogens herrar')
  if (S.phone) await page.getByRole('tab', { name: '2 · Fälten' }).click()
  await page.getByRole('button', { name: S.frame, exact: true }).click()
  await page.getByRole('button', { name: 'Välj temat Krönika' }).click()
  if (S.phone) await page.getByRole('tab', { name: '3 · Korten' }).click()
  await page.getByLabel('kort 1 Regeltext').fill(BODY)
  await page.evaluate('document.fonts.ready.then(() => undefined)')
  await page.waitForTimeout(1500)
  await page.evaluate('document.activeElement && document.activeElement.blur()')
  await page.evaluate(`document.querySelector('.byd-wizard-preview').scrollIntoView({ block: '${S.phone ? 'start' : 'center'}' })`)
  await page.waitForTimeout(300)
}

async function project(browser) {
  if (existsSync(PROJECT)) return readFileSync(PROJECT, 'utf8').trim()
  const ctx = await context(browser, SURFACES.guide)
  const page = await ctx.newPage()
  await guide(page, SURFACES.guide)
  await page.getByRole('button', { name: /Skapa spelet och fortsätt i editorn/ }).click()
  await page.waitForFunction('location.pathname.startsWith("/editor")', null, { timeout: 30_000 })
  await page.waitForTimeout(1500)
  const url = page.url()
  writeFileSync(PROJECT, url)
  await ctx.close()
  return url
}

async function context(browser, S) {
  const ctx = await browser.newContext({ viewport: { width: S.w, height: S.h }, deviceScaleFactor: 2, locale: 'sv-SE', ...(S.phone ? { hasTouch: true, isMobile: true } : {}) })
  await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  return ctx
}

// ── Pixels ──────────────────────────────────────────────────────────────────────────────────────
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}
const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')
const parse = (css) => {
  const m = css.match(/[\d.]+/g)
  return m.slice(0, 3).map(Number)
}
const png = (buf) => PNG.sync.read(buf)
const px = (img, x, y) => {
  const i = (img.width * y + x) << 2
  return [img.data[i], img.data[i + 1], img.data[i + 2]]
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.floor(s.length / 2)] : 0
}

// The marks as painted: what changed between the page with the mark layer hidden and shown, read
// pixel by pixel in the region around the box and the marks (#808). The changed pixels are
// grouped by colour, and each group's contrast is read against what lay under it — so a mark in two
// bands says which band carries it on this card.
function painted(off, on, region, readable, dpr) {
  const changed = []
  for (let y = 0; y < on.height; y++)
    for (let x = 0; x < on.width; x++) {
      const a = px(off, x, y)
      const b = px(on, x, y)
      if (Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2])) > 24) changed.push({ x, y, fg: b, bg: a })
    }
  // Over a whole line of text the card shows, in CSS pixels.
  const inLine = (p) => readable.some((r) => {
    const cx = region.x + p.x / dpr
    const cy = region.y + p.y / dpr
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h
  })
  const covered = changed.filter(inLine).length / (dpr * dpr)
  // And of that, what was a letter: a pixel of a whole line that stood well apart from the paper
  // (the commonest colour in the region) before the mark was drawn over it.
  const counts = new Map()
  for (let y = 0; y < off.height; y++)
    for (let x = 0; x < off.width; x++) {
      const k = px(off, x, y).join(',')
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  const paper = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
  const overInk = changed.filter((p) => inLine(p) && contrast(p.bg, paper) > 2).length / (dpr * dpr)
  const groups = new Map()
  for (const p of changed) {
    const k = p.fg.map((c) => c >> 5).join(',')
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(p)
  }
  const bands = [...groups.values()]
    .filter((g) => g.length >= changed.length * 0.08)
    .map((g) => {
      const fg = [0, 1, 2].map((i) => g.reduce((s, p) => s + p.fg[i], 0) / g.length)
      return { fg: hex(fg), share: Math.round((100 * g.length) / changed.length), contrast: Math.round(100 * median(g.map((p) => contrast(fg, p.bg)))) / 100, under: hex([0, 1, 2].map((i) => median(g.map((p) => p.bg[i])))) }
    })
    .sort((a, b) => b.share - a.share)
  const atLeast3 = changed.filter((p) => contrast(p.fg, p.bg) >= 3).length
  return { area: Math.round(changed.length / (dpr * dpr)), covered: Math.round(covered), overInk: Math.round(overInk), paper: hex(paper), bands, best: Math.max(0, ...bands.map((b) => b.contrast)), share3: changed.length ? Math.round((100 * atLeast3) / changed.length) : 0 }
}

// The background of a sentence: the commonest colour in its box, and the ink's contrast on it.
function sentence(img, inkCss) {
  const counts = new Map()
  for (let y = 0; y < img.height; y++)
    for (let x = 0; x < img.width; x++) {
      const c = px(img, x, y)
      const k = c.join(',')
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
  const bg = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number)
  const ink = parse(inkCss)
  return { bg: hex(bg), ink: hex(ink), contrast: Math.round(100 * contrast(ink, bg)) / 100 }
}

const clamp = (r, vw, vh) => {
  const x = Math.max(0, Math.floor(r.x))
  const y = Math.max(0, Math.floor(r.y))
  return { x, y, width: Math.min(vw, Math.ceil(r.x + r.w)) - x, height: Math.min(vh, Math.ceil(r.y + r.h)) - y }
}
const union = (rs, pad) => {
  const x0 = Math.min(...rs.map((r) => r.x)) - pad
  const y0 = Math.min(...rs.map((r) => r.y)) - pad
  const x1 = Math.max(...rs.map((r) => r.x + r.w)) + pad
  const y1 = Math.max(...rs.map((r) => r.y + r.h)) + pad
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

// Where things the sentence variant could push stand, before and after it is placed.
const ANCHORS = {
  guide: ['.byd-wizard-card-tabs', '.byd-wizard-preview'],
  mall: ['.byd-foot-quiet', '#canvas'],
  vagg: ['.byd-wall-card', '.byd-wall'],
}
const anchors = (page, s) => page.evaluate(`(${JSON.stringify(ANCHORS[s])}).map((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return { q, y: r.y, h: r.height, w: r.width } })`)

const browser = await chromium.launch()
const results = []
const url = SURF.some((s) => SURFACES[s].editor) ? await project(browser) : null
for (const s of SURF) {
  const S = SURFACES[s]
  const ctx = await context(browser, S)
  const page = await ctx.newPage()
  if (S.editor) {
    await page.goto(url)
    await page.locator('.byd-wall-card').first().waitFor()
    if (S.editor === 'template') {
      await page.locator('#byd-editor-tab-template').click()
      await page.locator('#canvas').waitFor()
    }
    await page.evaluate('document.fonts.ready.then(() => undefined)')
    await page.waitForTimeout(1500)
    await page.mouse.move(S.w - 5, S.h - 5)
  } else await guide(page, S)
  await page.evaluate(PAGE)
  const kind = s.startsWith('guide') ? 'guide' : s
  for (const v of VARIANTS) {
    const before = await anchors(page, kind)
    const n = await page.evaluate(`window.__p808.place(${JSON.stringify(v)})`)
    await page.waitForTimeout(v === 'c' ? 800 : 150)
    const m = await page.evaluate('window.__p808.measure()')
    const after = await anchors(page, kind)
    const file = `${v}-${s}`
    await page.screenshot({ path: join(OUT, `${file}-full.png`) })
    const c = m.cut[0]
    // A close-up of the card the text is on, with room round it for what hangs off it.
    const near = clamp(union([c.card, ...m.marks.map((k) => k.rect)], 16), S.w, S.h)
    await page.screenshot({ path: join(OUT, `${file}-crop.png`), clip: near })
    let pix = null
    let words = null
    if (v !== 'nu' && v !== 'c') {
      const region = clamp(union([c.box, ...m.marks.map((k) => k.rect)], 8), S.w, S.h)
      await page.evaluate('window.__p808.layer(false)')
      const off = png(await page.screenshot({ clip: region }))
      await page.evaluate('window.__p808.layer(true)')
      const on = png(await page.screenshot({ clip: region }))
      pix = painted(off, on, region, m.readable, 2)
    }
    if (v === 'c') {
      const k = m.marks[0]
      const img = png(await page.screenshot({ clip: clamp(k.rect, S.w, S.h) }))
      words = { ...sentence(img, k.color), clipped: k.clipped, w: Math.round(k.rect.w), h: Math.round(k.rect.h), overCard: !(k.rect.y >= c.card.y + c.card.h || k.rect.y + k.rect.h <= c.card.y || k.rect.x >= c.card.x + c.card.w || k.rect.x + k.rect.w <= c.card.x) }
    }
    const shift = after.map((a, i) => (a && before[i] ? { q: a.q, dy: Math.round(a.y - before[i].y), dh: Math.round(a.h - before[i].h) } : null)).filter(Boolean)
    // What a tag says, against its own ground: these are solid, so the declared colours are what is painted.
    const tagInk = v === 'a' || v === 'b' ? Math.round(100 * contrast(parse('rgb(230,236,250)'), parse('rgb(35,38,46)'))) / 100 : null
    results.push({ v, s, w: S.w, h: S.h, file, n, cut: m.cut, marks: m.marks.map((k) => ({ cls: k.cls, w: Math.round(k.rect.w), h: Math.round(k.rect.h), text: k.text, inView: k.inView, said: k.said })), pix, words, shift, tagInk, named: m.named, collide: m.collide })
    console.log(v, s, `cut ${c.hidden}/${c.lines} rader @ ${c.sizePx}px`, pix ? `area ${pix.area} covered ${pix.covered} ink ${pix.overInk} best ${pix.best} share3 ${pix.share3}% bands ${JSON.stringify(pix.bands)}` : '', words ? JSON.stringify(words) : '', JSON.stringify(shift), 'collide', JSON.stringify(m.collide))
    await page.evaluate('window.__p808.clear()')
    await page.waitForTimeout(100)
  }
  await ctx.close()
}
writeFileSync(join(OUT, `results-${VARIANTS.join('_')}-${SURF.join('_')}.json`), JSON.stringify(results, null, 2))
await browser.close()

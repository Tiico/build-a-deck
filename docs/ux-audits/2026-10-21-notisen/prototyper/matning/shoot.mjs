// PROTOTYP — kastas (#1073). Öppnar editorn i den byggda appen på e2e-stacken, får fram en riktig
// notis (`.byd-editor-notice`) genom att låta bordets begäran falla, byter sedan notisens text mot
// var och en av de meningar som står på samma yta, i samma element och samma stilmall, och lägger
// varje variant ovanpå med page.js.
//
//   node shoot.mjs <ut-katalog> [bredder] [varianter]
//
// En yta är <bredd>-<sv|en>-<mac|bred>-<bord|utan>-<ai|plain>. «bred» är editorns text i Verdana
// (DejaVus bredd, som på CI:s Linux). «bord» är ett spel med ett bord igång (huvudet bär då
// «Uppdatera» och pilen), «utan» ett utan (huvudet bär «Starta bordet»).
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const OUT = process.argv[2] ?? join(HERE, 'shots')
const WIDTHS = (process.argv[3] ?? '1024,1280,1440').split(',')
const H = { 1024: 768, 1280: 800, 1440: 900 }
const VARIANTS = (process.argv[4] ?? 'nu,a,b,c').split(',')
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
mkdirSync(OUT, { recursive: true })

const MSG = {
  sv: {
    'undo-kortleken': 'Det gick inte att ångra en ändring i kortleken: någon annan har ändrat samma sak sedan dess. Inget skrevs över.',
    'undo-typsnitt': 'Det gick inte att göra om en ändring bland typsnitten: någon annan har ändrat samma sak sedan dess. Inget skrevs över.',
    'kolumnen-1072': 'Kortet kom tillbaka, men inte dess värde i kolumnen «stämning»: någon annan har tagit bort kolumnen sedan dess.',
    'sparning': 'Sparningen gick inte igenom. Det du har ändrat ligger kvar i den här fliken, så det går bra att trycka «Spara» igen.',
    'avvisad-993': 'En ändring gick inte igenom och togs bort. Spelet visar nu det alla andra ser.',
    'ikon': 'Ikonen svärd kunde inte läggas på kortet. Försök igen.',
    'bordet': 'Bordet kunde inte uppdateras. Försök igen.',
  },
  en: {
    'undo-kortleken': 'Could not undo a change to the deck: someone else has changed the same thing since. Nothing was written over.',
    'undo-typsnitt': 'Could not redo a change among the typefaces: someone else has changed the same thing since. Nothing was written over.',
    'kolumnen-1072': 'The card came back, but not its value in the column “stämning”: someone else has removed the column since.',
    'sparning': 'The save did not go through. What you changed is still in this tab, so it is fine to press “Save” again.',
    'avvisad-993': 'A change did not go through and was taken back. The game now shows what everyone else sees.',
    'ikon': 'The icon sword could not be placed on the card. Try again.',
    'bordet': 'The table could not be updated. Try again.',
  },
}

const WIDE = ".byd-editor, .byd-editor * { font-family: Verdana, 'DejaVu Sans', sans-serif !important; }"

// Huvudets egna delar, med den delade knappens två halvor som två delar.
const PIECES = () => {
  const header = document.querySelector('.byd-editor > header')
  const shown = (el) => el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0
  const said = (el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 24) || el.className
  const pieces = [...header.children].flatMap((el) => (el.classList.contains('byd-editor-split') ? [...el.children] : [el])).filter(shown).filter((el) => !el.classList.contains('byd-editor-spacer'))
  const r = (el) => {
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 }
  }
  const cut = [...header.querySelectorAll(':scope > .byd-editor-name, :scope :is(button, a)')]
    .filter((el) => shown(el) && el.scrollWidth > el.clientWidth + 1)
    .map(said)
  const hb = header.getBoundingClientRect()
  const name = header.querySelector(':scope > .byd-editor-name')
  return {
    header: { h: Math.round(hb.height * 10) / 10 },
    pieces: pieces.map((el) => ({ k: el.classList.contains('byd-editor-notice') ? 'NOTIS' : said(el), ...r(el) })),
    cut,
    name: { w: Math.round(name.getBoundingClientRect().width), full: name.scrollWidth <= name.clientWidth + 1 },
    across: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    workTop: Math.round(document.querySelector('.byd-editor > main')?.getBoundingClientRect().top ?? -1),
  }
}

// Kontrast mätt på målade pixlar: notisens ruta fotograferad, marken är den vanligaste färgen och
// bläcket den som ligger längst från den bland de färger som täcker minst 1 % av rutan.
async function painted(page, clip) {
  const png = await page.screenshot({ clip, scale: 'device' })
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = `data:image/png;base64,${b64}`
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width
    c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, c.width, c.height).data
    const count = new Map()
    for (let i = 0; i < d.length; i += 4) {
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
      count.set(k, (count.get(k) ?? 0) + 1)
    }
    const all = [...count.entries()].sort((a, b) => b[1] - a[1])
    const rgb = (k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]
    const lum = ([r, g2, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
      return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b)
    }
    const ground = rgb(all[0][0])
    const px = d.length / 4
    const inks = all.filter(([, n]) => n >= px * 0.01).map(([k]) => rgb(k))
    let ink = ground
    let best = 1
    for (const c2 of inks) {
      const a = lum(c2)
      const b = lum(ground)
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      if (ratio > best) {
        best = ratio
        ink = c2
      }
    }
    const hex = (c3) => '#' + c3.map((v) => v.toString(16).padStart(2, '0')).join('')
    return { ground: hex(ground), ink: hex(ink), ratio: Math.round(best * 100) / 100 }
  }, png.toString('base64'))
}

const SHOWN = new Set(['undo-kortleken', 'sparning', 'kolumnen-1072'])
const browser = await chromium.launch()
const results = []
for (const w of WIDTHS) for (const lang of ['sv', 'en']) for (const font of ['mac', 'bred']) for (const state of ['bord', 'utan']) for (const who of ['plain', 'ai']) {
  const s = `${w}-${lang}-${font}-${state}-${who}`
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: H[w] }, deviceScaleFactor: 2, locale: lang === 'sv' ? 'sv-SE' : 'en-GB' })
  const [name, value] = links[who].cookie.split('=')
  await ctx.addCookies([{ name, value, url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  if (font === 'bred') await ctx.addInitScript(`document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(WIDE)}; document.head.append(s) })`)
  const page = await ctx.newPage()
  page.setDefaultTimeout(20000)
  // Ett eget spel per yta, kopierat ur riggens, så att ingen annan mätning står i huvudets «inne».
  const cookie = links[who].cookie
  const id = decodeURIComponent(links[who][state].split('project=')[1])
  const { id: _id, rev: _rev, owner: _owner, ...doc } = await (await fetch(`${links.origin}/projects/${encodeURIComponent(id)}`, { headers: { cookie } })).json()
  const made = await fetch(`${links.origin}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(doc) })
  if (made.status !== 201) throw new Error(`project: ${made.status} ${await made.text()}`)
  const own = (await made.json()).id
  if (state === 'bord') await fetch(`${links.origin}/projects/${encodeURIComponent(own)}/sessions`, { method: 'POST', headers: { cookie } })
  await page.goto(`${links.origin}/editor?project=${encodeURIComponent(own)}&lang=${lang}`)
  const primary = page.locator('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')
  await primary.waitFor()
  await page.waitForFunction((k) => document.querySelector('.byd-editor > header .byd-editor-primary:not(.byd-editor-caret)')?.getAttribute('data-table-kind') === k, state === 'bord' ? 'running' : 'none')
  let aiOpen = false
  if (who === 'ai') {
    const panel = page.locator('aside.byd-ai, [role="complementary"]').first()
    if (!(await panel.isVisible().catch(() => false))) await page.getByRole('button', { name: lang === 'sv' ? 'AI-hjälp' : 'AI help' }).first().click()
    await panel.waitFor()
    aiOpen = await panel.isVisible()
  }
  await page.waitForTimeout(400)
  const before = await page.evaluate(PIECES)
  // Bordets begäran faller, och editorn säger det i notisen.
  if (state === 'bord') await page.route('**/sessions/*/prepare**', (r) => r.fulfill({ status: 500, body: 'nej' }))
  else await page.route('**/projects/*/sessions', (r) => (r.request().method() === 'POST' ? r.fulfill({ status: 500, body: 'nej' }) : r.continue()))
  await primary.click()
  const notice = page.locator('.byd-editor-notice')
  await notice.waitFor({ state: 'attached' })
  const real = (await notice.textContent()).trim()
  await page.evaluate(PAGE)
  for (const [key, text] of Object.entries(MSG[lang])) for (const v of VARIANTS) {
    await page.evaluate(([vv, t]) => window.__p1073.show(vv, t), [v, text])
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
    const after = await page.evaluate(PIECES)
    const n = await page.evaluate(() => window.__p1073.measure())
    const moved = []
    for (const p of after.pieces) {
      if (p.k === 'NOTIS') continue
      const was = before.pieces.find((q) => q.k === p.k)
      if (!was) continue
      const dx = Math.round(p.x - was.x)
      const dw = Math.round(p.w - was.w)
      const dy = Math.round(p.y - was.y)
      if (dx || dw || dy) moved.push(`${p.k}: x${dx >= 0 ? '+' : ''}${dx} w${dw >= 0 ? '+' : ''}${dw} y${dy >= 0 ? '+' : ''}${dy}`)
    }
    const contrast = await painted(page, { x: n.box.x, y: n.box.y, width: Math.max(1, n.box.w), height: Math.max(1, n.box.h) })
    const file = SHOWN.has(key) && who === 'plain' ? `${v}-${s}-${key}.png` : null
    if (file) await page.screenshot({ path: join(OUT, file) })
    const row = { v, s, w: Number(w), h: H[w], lang, font, state, who, aiOpen, key, text, real, file, lines: n.lines, box: n.box, covers: n.covers, headerBefore: before.header.h, headerAfter: after.header.h, workDown: after.workTop - before.workTop, workTop: after.workTop, nameBefore: before.name, nameAfter: after.name, cut: after.cut, cutBefore: before.cut, moved, across: after.across, contrast }
    results.push(row)
    console.log(v.padEnd(3), s, key.padEnd(15), `${n.lines} rad(er) ${n.box.w}×${n.box.h}px | huvud ${before.header.h}→${after.header.h} | arbetet +${row.workDown} | namn ${before.name.w}→${after.name.w}${after.name.full ? '' : ' KLIPPT'} | täcker ${JSON.stringify(n.covers)} | ${contrast.ink}/${contrast.ground} ${contrast.ratio}:1 | flyttat ${moved.length}`)
  }
  await ctx.close()
}
writeFileSync(join(OUT, `results-${WIDTHS.join('_')}-${VARIANTS.join('_')}.json`), JSON.stringify(results, null, 1))
await browser.close()
process.exit(0)

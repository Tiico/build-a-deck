// PROTOTYP — kastas (#1061). Öppnar Tabell i den byggda editorn på e2e-stacken, lägger varianten
// ovanpå den riktiga dörren och foten med page.js, öppnar dörren med pekaren, trycker en kolumns ×
// med pekaren, mäter frågan, fotograferar, och svarar «Avbryt» med pekaren om den går att nå.
//
//   node shoot.mjs <ut-katalog> nu,a,b,c,d [ytor]
//
// En yta är <bredd>-<sv|en>-<mac|bred>-<prov|tat>-<kolumn>: 1024-sv-bred-tat-stamning.
// «bred» är editorns text i Verdana (DejaVus bredd, som på CI:s Linux), satt innan tabellen mäter
// sig. Kolumnen är den vars × trycks: «stamning» (stämning, som mallen inte ritar: den korta frågan)
// eller «body» (som mallen ritar: frågan får en mening till om elementet som tas bort ur mallen).
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = process.argv[2] ?? join(HERE, 'shots')
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c,d').split(',')
const H = { 1024: 768, 1280: 800, 1440: 900 }
const COL = { stamning: 'stämning', body: 'body' }
const ALL = []
for (const w of ['1024', '1280', '1440']) for (const l of ['sv', 'en']) for (const f of ['mac', 'bred']) for (const d of ['tat-stamning', 'tat-body', 'prov-body']) ALL.push(`${w}-${l}-${f}-${d}`)
const SURF = (process.argv[4] ?? ALL.join(',')).split(',')
// Bilder görs av de svenska ytorna i den täta leken, i båda typsnitten, och av den engelska vid 1024
// i det breda typsnittet med den långa frågan.
const SHOWN = (s) => /^\d+-sv-(mac|bred)-tat-/.test(s) || s === '1024-en-bred-tat-body'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const centre = (r) => [r.x + r.w / 2, r.y + r.h / 2]
const dist = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1]))
// The shortest way from a point to a rectangle: how far the eye goes from the × to the question.
const toRect = ([x, y], r) => Math.round(Math.hypot(Math.max(r.x - x, 0, x - (r.x + r.w)), Math.max(r.y - y, 0, y - (r.y + r.h))))

const results = []
for (const s of SURF) for (const v of VARIANTS) {
  const [w, lang, font, deck, col] = s.split('-')
  const field = COL[col]
  const ctx = await browser.newContext({ viewport: { width: Number(w), height: H[w] }, deviceScaleFactor: 2, locale: lang === 'sv' ? 'sv-SE' : 'en-GB' })
  const [name, value] = links.cookie.split('=')
  await ctx.addCookies([{ name, value, url: links.origin }])
  await ctx.route('**/faces/**', (r) => r.fulfill({ status: 202, body: '' }))
  await ctx.addInitScript(`document.addEventListener('DOMContentLoaded', () => { ${PAGE}; ${font === 'bred' ? 'window.__p1061.wide()' : ''} })`)
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(`${links.origin}${links[deck]}&lang=${lang}`)
  await page.locator('#byd-editor-tab-table').click()
  await page.waitForFunction(() => document.querySelector('table.byd-data')?.style.tableLayout === 'fixed')
  await page.waitForTimeout(400)
  await page.evaluate(`window.__p1061.arm(${JSON.stringify(v)})`)
  const handle = page.locator('.byd-data thead .byd-data-remove > button')
  await handle.click()
  await page.locator('.byd-columns').waitFor()
  await page.waitForTimeout(300)
  const pre = await page.evaluate(`window.__p1061.before(${JSON.stringify(field)})`)
  const xAt = centre(pre.x)
  await page.mouse.click(...xAt)
  await page.locator('[role="alertdialog"]:visible').waitFor()
  await page.waitForTimeout(350)
  const m = await page.evaluate('window.__p1061.measure()')
  const said = (await page.locator('[role="alertdialog"]:visible').ariaSnapshot()).replace(/^- /, '').trim()
  const file = SHOWN(s) ? `${v}-${s}.png` : null
  if (file) await page.screenshot({ path: join(OUT, file) })
  const avbryt = m.answers.at(-1)
  const ja = m.answers[0]
  // Answer «Avbryt» the way a hand would; if the hand cannot reach it, the way the gate does today.
  let svar = 'pekaren'
  if (avbryt?.hit === 'ok') await page.mouse.click(...centre(avbryt.r))
  else {
    svar = 'tangentbordet'
    await page.locator('[role="alertdialog"]:visible').getByRole('button', { name: avbryt.t }).focus()
    await page.keyboard.press('Enter')
  }
  await page.locator('[role="alertdialog"]').waitFor({ state: 'hidden' })
  await page.waitForTimeout(250)
  const after = await page.evaluate(() => {
    const a = document.activeElement
    const where = a?.closest('.byd-columns') ? 'dörren' : a?.closest('.byd-crown-foot') ? 'foten' : a === document.body ? 'body' : 'annat'
    const d = document.querySelector('.byd-columns')
    return { focus: a ? `${a.getAttribute('aria-label') || a.textContent.trim().slice(0, 20) || a.tagName} (${where})` : null, doorOpen: !!d && d.checkVisibility() }
  })
  const row = {
    v, s, file, dpr: 2, winW: Number(w), winH: H[w], field, said, svar, after,
    ...m,
    seenBefore: pre.seen,
    total: pre.total,
    doorBefore: pre.door,
    footGrew: m.foot && pre.footH !== null ? m.foot.h - pre.footH : null,
    drift: m.row && pre.row ? m.row.y - pre.row.y : null,
    tableMoved: m.first !== null && pre.first !== null ? m.first - pre.first : null,
    eye: m.q ? toRect(xAt, m.q) : null,
    hand: avbryt ? dist(xAt, centre(avbryt.r)) : null,
    jaOk: ja?.hit === 'ok',
    avbrytOk: avbryt?.hit === 'ok',
  }
  results.push(row)
  console.log(v, s, `ja ${ja?.hit} | avbryt ${avbryt?.hit} | fokus ${m.focus} | rader i dörren ${pre.seen}→${m.seen} | drift ${row.drift} | ögat ${row.eye} handen ${row.hand} | fot +${row.footGrew} px, tyst ${m.quiet} | fråga ${m.qLines} rad(er) | efter: ${after.focus}, dörr ${after.doorOpen ? 'öppen' : 'stängd'}`)
  await ctx.close()
}
writeFileSync(join(OUT, `results-${Date.now()}.json`), JSON.stringify(results, null, 1))
await browser.close()
process.exit(0)

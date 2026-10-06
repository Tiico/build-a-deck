// Engångsdrivare för prototypen till #687: det BYGGDA appens /new på e2e-stacken, varje variant
// injicerad (page.js), fotograferad och mätt i Chromium. Google nås på riktigt — bytena är äkta —
// men genom Playwrights route, så att filerna kan hållas inne och läget «hämtas» fotograferas.
//
//   node shoot.mjs <pass> [varianter]     pass: open | loading | resume | keyboard | box | steps
import { chromium } from '@playwright/test'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const links = JSON.parse(readFileSync(join(HERE, 'links.json'), 'utf8'))
const PAGE = readFileSync(join(HERE, 'page.js'), 'utf8')
const OUT = join(HERE, 'shots')
mkdirSync(OUT, { recursive: true })
const PASS = process.argv[2] ?? 'open'
const VARIANTS = (process.argv[3] ?? 'nu,a,b,c,d').split(',')
const GOOGLE = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//
const browser = await chromium.launch()

// Layout shifts, all of them, with whether input came just before (CLS leaves those out).
const SHIFTS = `window.__shifts = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ t: Math.round(e.startTime), v: e.value, input: e.hadRecentInput }) }).observe({ type: 'layout-shift', buffered: true })`

async function open({ w = 1280, h = 800, loggedIn = true, hold = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, locale: 'sv-SE' })
  if (loggedIn) await ctx.addCookies([{ name: 'byd_session', value: links.cookie.split('=')[1], url: links.origin }])
  await ctx.addInitScript(SHIFTS)
  const google = []
  let release
  const held = new Promise((r) => (release = r))
  await ctx.route(GOOGLE, async (route) => {
    try {
      const url = route.request().url()
      const res = await route.fetch()
      const body = await res.body()
      google.push({ url, bytes: body.length, at: Date.now() })
      if (hold && url.includes('gstatic')) await held
      await route.fulfill({ response: res, body })
    } catch {
      // The context closed with the file still on its way.
    }
  })
  const page = await ctx.newPage()
  return { ctx, page, google, release: () => release() }
}

async function go(page, v, opts = {}) {
  await page.goto(links.origin + '/new', { waitUntil: 'load' })
  await page.locator('.byd-wizard-handoff').waitFor()
  await page.waitForTimeout(300)
  await page.mouse.move(2, 2)
  await page.evaluate(PAGE)
  await page.evaluate(`window.__p687.install(${JSON.stringify(v)}, ${JSON.stringify(opts)})`)
  await page.waitForTimeout(300)
}

// Which faces actually draw the card's title and body: Chromium's answer, as #887's test asks it.
async function rendered(page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
  const out = {}
  for (const el of ['title', 'body']) {
    const sel = `#wizard-live [data-element="${el}"], #wizard-live [data-element="${el}"] *`
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: sel })
    const fams = new Set()
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      for (const f of fonts) if (f.glyphCount > 0) fams.add(f.familyName + (f.isCustomFont ? '' : ' (system)'))
    }
    out[el] = [...fams].join(', ') || '–'
  }
  await cdp.detach()
  return out
}

const measure = async (page, google) => {
  const fonts = await rendered(page)
  const s = await page.evaluate('window.__p687.state()')
  const geo = await page.evaluate(() => {
    const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)] }
    const t = document.querySelector('#wizard-live [data-element="title"]')
    return { preview: r('.byd-wizard-preview'), title: r('#wizard-live [data-element="title"]'), titlePx: t ? getComputedStyle(t.querySelector('p') ?? t).fontSize : null, shifts: window.__shifts.slice() }
  })
  return { fonts, ...s, google: google.length, bytes: google.reduce((n, g) => n + g.bytes, 0), ...geo }
}
const correct = (m) => !m.fonts.title.includes('(system)') && !m.fonts.body.includes('(system)') && m.fonts.title !== '–'
const honest = (m) => !(m.pressed && !correct(m)) && !(m.says && /när du väljer/.test(m.says) && m.pressed)

const shot = async (page, file, clip) => {
  await page.screenshot({ path: join(OUT, file), clip })
  return file
}
// Playwright's screenshot waits for the faces to load, which is the very state this one is of.
const rawShot = async (page, file, clip) => {
  const cdp = await page.context().newCDPSession(page)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })
  writeFileSync(join(OUT, file), Buffer.from(data, 'base64'))
  await cdp.detach()
  return file
}
const cropOf = async (page, sel, pad = 12) => page.evaluate(([sel, pad]) => {
  const b = document.querySelector(sel).getBoundingClientRect()
  return { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: Math.min(innerWidth - Math.max(0, b.x - pad), b.width + 2 * pad), height: Math.min(innerHeight - Math.max(0, b.y - pad), b.height + 2 * pad) }
}, [sel, pad])

// The one press each variant asks of someone who keeps the preselection, to see the card in it.
async function act(page, v) {
  if (v === 'nu' || v === 'b') { await page.getByRole('button', { name: 'Välj temat Skogssaga' }).click(); return 1 }
  if (v === 'd') { await page.locator('.p687-pick').click(); return 1 }
  if (v === 'c') { const b = await page.locator('.byd-wizard-preview').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 8 }); return 0 }
  return 0
}
const waitCorrect = async (page, ms = 15000) => {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    await page.evaluate('document.fonts.ready')
    if (correct({ fonts: await rendered(page) })) return Date.now() - t0
    await page.waitForTimeout(100)
  }
  return null
}

const results = []
const save = () => writeFileSync(join(OUT, `results-${PASS}.json`), JSON.stringify(results, null, 2))

if (PASS === 'open') {
  for (const [w, h] of [[1280, 800], [1024, 768]]) for (const v of VARIANTS) {
    const { ctx, page, google } = await open({ w, h })
    await go(page, v)
    await page.waitForTimeout(v === 'a' ? 300 : 2500)
    const t0 = Date.now()
    const first = v === 'a' ? await waitCorrect(page) : null
    await page.waitForTimeout(800)
    const opened = await measure(page, google)
    const kortOpen = await shot(page, `${v}-kort-oppnad-${w}.png`, await cropOf(page, '.byd-wizard-card-workspace'))
    await page.evaluate(() => document.querySelector('.byd-wizard-look').scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    const temanOpen = await shot(page, `${v}-teman-oppnad-${w}.png`, await cropOf(page, '.byd-wizard-look'))
    await page.evaluate(() => document.querySelector('.byd-wizard-side').scrollTo(0, 0))
    await page.mouse.move(2, 2)
    const shiftsBefore = (await page.evaluate('window.__shifts.length'))
    const clicks = await act(page, v)
    const ms = await waitCorrect(page)
    await page.waitForTimeout(600)
    const after = await measure(page, google)
    after.newShifts = after.shifts.slice(shiftsBefore)
    await page.evaluate(() => { document.querySelector('.byd-wizard-side').scrollTo(0, 0); document.querySelector('.byd-wizard-main')?.scrollTo?.(0, 0) })
    await page.mouse.move(2, 2)
    await page.waitForTimeout(200)
    const kortAfter = await shot(page, `${v}-kort-efter-${w}.png`, await cropOf(page, '.byd-wizard-card-workspace'))
    await page.evaluate(() => document.querySelector('.byd-wizard-look').scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(300)
    const temanAfter = await shot(page, `${v}-teman-efter-${w}.png`, await cropOf(page, '.byd-wizard-look'))
    // Accepting the preselection: a name, then «Skapa». Only B refuses; the others go on.
    let refusal = null
    if (v === 'b' && w === 1280) {
      const { ctx: c2, page: p2, google: g2 } = await open({ w, h })
      await go(p2, v)
      await p2.getByLabel('Spelets namn').fill('Skogens herrar')
      await p2.locator('.byd-wizard-main .byd-wizard-primary').click()
      await p2.waitForTimeout(500)
      refusal = { ...(await p2.evaluate('window.__p687.state()')), file: await shot(p2, `b-teman-nekad-${w}.png`, await cropOf(p2, '.byd-wizard-look')) }
      await c2.close()
    }
    const r = { v, w, h, opened: { ...opened, correct: correct(opened), honest: honest(opened), correctAfterOpenMs: first }, after: { ...after, correct: correct(after), honest: honest(after), clicks, ms }, files: { kortOpen, temanOpen, kortAfter, temanAfter }, refusal }
    console.log(v, w, 'öppnad', JSON.stringify(opened.fonts), opened.pressed, '|', opened.says, '| bytes', opened.bytes, '|| efter', clicks, 'tryck', ms, 'ms', JSON.stringify(after.fonts), 'bytes', after.bytes, 'shifts', JSON.stringify(after.newShifts))
    results.push(r)
    save()
    await ctx.close()
  }
}

if (PASS === 'loading') {
  // The faces held at the door: what the card is while they travel. CardPreview declares them
  // with font-display: block, so the text is invisible for up to three seconds and then fallback.
  for (const v of VARIANTS) {
    const { ctx, page, google, release } = await open({ hold: true })
    await go(page, v)
    if (v !== 'a') { await page.waitForTimeout(600); await act(page, v) }
    await page.evaluate(() => document.querySelector('.byd-wizard-side').scrollTo(0, 0))
    await page.mouse.move(2, 2)
    await page.waitForTimeout(500)
    const m1 = await measure(page, google)
    const f1 = await rawShot(page, `${v}-kort-hamtas-${1280}.png`, await cropOf(page, '.byd-wizard-preview'))
    await page.waitForTimeout(3200)
    const m2 = await measure(page, google)
    const f2 = await rawShot(page, `${v}-kort-hamtas3s-${1280}.png`, await cropOf(page, '.byd-wizard-preview'))
    release()
    const ms = await waitCorrect(page)
    const m3 = await measure(page, google)
    results.push({ v, half: { fonts: m1.fonts, says: m1.says, file: f1 }, three: { fonts: m2.fonts, says: m2.says, file: f2 }, done: { fonts: m3.fonts, ms, shifts: m3.shifts } })
    console.log(v, 'hämtas 0,5 s', JSON.stringify(m1.fonts), m1.says, '| 3,7 s', JSON.stringify(m2.fonts), '| släppt', ms)
    save()
    await ctx.close()
  }
}

if (PASS === 'resume') {
  // A draft with Krönika pressed and fetched, then the page reloaded: the speltest's second case.
  for (const v of VARIANTS) {
    const { ctx, page, google } = await open()
    await go(page, v)
    await page.getByLabel('Spelets namn').fill('Krönikan')
    await page.getByRole('button', { name: 'Välj temat Krönika' }).click()
    await waitCorrect(page)
    await page.waitForTimeout(600)
    const n0 = google.length
    await page.reload({ waitUntil: 'load' })
    await page.locator('.byd-wizard-handoff').waitFor()
    await page.waitForTimeout(300)
    await page.mouse.move(2, 2)
    await page.evaluate(PAGE)
    await page.evaluate(`window.__p687.install(${JSON.stringify(v)}, { resumed: true })`)
    await page.waitForTimeout(2500)
    const m = await measure(page, google)
    const f = await shot(page, `${v}-kort-utkast-1280.png`, await cropOf(page, '.byd-wizard-card-workspace'))
    results.push({ v, ...m, correct: correct(m), honest: honest(m), googleAfterReload: google.length - n0, file: f })
    console.log(v, 'utkast', JSON.stringify(m.fonts), m.pressed, m.forval, '|', m.says, '| correct', correct(m), 'honest', honest(m))
    save()
    await ctx.close()
  }
}

if (PASS === 'keyboard') {
  // C's trigger in two journeys that keep the preselection: the pointer from the name to the card's
  // title field, and the keyboard tabbing on from the name.
  for (const [journey] of [['mus'], ['tangentbord']]) for (const [w, h] of [[1280, 800], [1024, 768]]) {
    const { ctx, page, google } = await open({ w, h })
    await go(page, 'c')
    await page.getByLabel('Spelets namn').click()
    await page.keyboard.type('Skogens herrar')
    let fired = null
    if (journey === 'mus') {
      const a = await page.getByLabel('Spelets namn').boundingBox()
      const b = await page.getByLabel('kort 1 Titel').boundingBox()
      await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 25 })
      await page.waitForTimeout(300)
      fired = google.length > 0 ? 'på vägen till kortets titel' : null
    } else {
      for (let n = 1; n <= 60 && !fired; n++) {
        await page.keyboard.press('Tab')
        await page.waitForTimeout(60)
        if (google.length > 0) fired = `efter ${n} tab (${await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.slice(0, 30))})`
      }
    }
    results.push({ journey, w, fired })
    console.log('C', journey, w, fired)
    save()
    await ctx.close()
  }
}

if (PASS === 'box') {
  for (const [w, h] of [[1280, 800], [1024, 768], [768, 1024]]) for (const b of ['nu', 'bort', 'mening', 'konto']) for (const loggedIn of b === 'konto' ? [false, true] : [true]) {
    const { ctx, page } = await open({ w, h, loggedIn })
    await go(page, 'nu', { box: b, loggedIn })
    await page.waitForTimeout(400)
    const clip = { x: 0, y: 0, width: w, height: Math.min(h, w >= 1024 ? 330 : 420) }
    const f = await shot(page, `ruta-${b}${b === 'konto' ? (loggedIn ? '-inne' : '-ute') : ''}-${w}.png`, clip)
    const geo = await page.evaluate(() => { const e = document.querySelector('.byd-wizard-handoff'); const n = document.querySelector('#byd-wizard-h1'); return { box: e ? [Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)] : null, text: e?.innerText ?? null, step1Top: n ? Math.round(n.getBoundingClientRect().top) : null } })
    results.push({ box: b, loggedIn, w, ...geo, file: f })
    console.log('ruta', b, loggedIn ? 'inne' : 'ute', w, JSON.stringify(geo))
    save()
    await ctx.close()
  }
}

if (PASS === 'steps') {
  // Below the desk (768, a large tablet upright; L12): the gallery is step 2 and the card step 3.
  for (const v of VARIANTS) {
    const { ctx, page, google } = await open({ w: 768, h: 1024 })
    await go(page, v)
    await page.waitForTimeout(400)
    await page.getByRole('tab', { name: '3 · Korten' }).click()
    await page.waitForTimeout(1500)
    const m0 = await measure(page, google)
    const f0 = await shot(page, `${v}-kort-oppnad-768.png`, await cropOf(page, '.byd-wizard-card-workspace'))
    let clicks = 1 // the tab to step 3 is counted only as the way to the card
    clicks = 0
    // The presses from step 3 to a card in the theme's faces.
    if (v === 'nu' || v === 'b') {
      await page.getByRole('tab', { name: '2 · Fälten' }).click()
      await page.getByRole('button', { name: 'Välj temat Skogssaga' }).click()
      await page.getByRole('tab', { name: '3 · Korten' }).click()
      clicks = 3
    } else if (v === 'd') { await page.locator('.p687-pick').click(); clicks = 1 }
    else if (v === 'c') {
      // There is no pointer on a tablet: C fires on a touch on the card, or on focus.
      await page.locator('.byd-wizard-preview').tap?.().catch(() => undefined)
      const b = await page.locator('.byd-wizard-preview').boundingBox(); await page.mouse.move(b.x + 10, b.y + 10, { steps: 4 })
    }
    const ms = await waitCorrect(page)
    await page.waitForTimeout(500)
    const m1 = await measure(page, google)
    const f1 = await shot(page, `${v}-kort-efter-768.png`, await cropOf(page, '.byd-wizard-card-workspace'))
    results.push({ v, opened: { fonts: m0.fonts, says: m0.says, pressed: m0.pressed, file: f0, correct: correct(m0) }, after: { fonts: m1.fonts, clicks, ms, file: f1, correct: correct(m1) } })
    console.log(v, '768', JSON.stringify(m0.fonts), m0.says, '→', clicks, 'tryck', ms, JSON.stringify(m1.fonts))
    save()
    await ctx.close()
  }
}
await browser.close()

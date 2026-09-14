// PROTOTYPE — throwaway (#89). Drives the prototype route in real Chromium and writes one PNG per
// variant per mode at the tightest setting a table can be in, plus every raw measurement.
//
//   pnpm --filter @byd/web exec vite --port 5466 --strictPort
//   node packages/web/src/prototype/counterzone/shots.mjs http://localhost:5466
//
// The screens are the ones #89 quotes: 1280 x 800, 1366 x 1024 and 1920 x 1080 in table mode,
// and 1920 x 1080 and 3840 x 2160 in TV mode, which is where K18's eight-seat table is meant to
// be read from three metres (K9). The played felt is not an editor, so L12 sends it to its own
// measures and not to 390 and 768.
//
// Four things are measured that no picture shows:
//
//   * every target's box ON THE SCREEN, never the box it was set to — in table mode the felt lies
//     under `rotateX(13deg)` inside a `perspective`;
//   * how many PAIRS of targets reach into each other, printed, so an empty list cannot pass;
//   * the narrowest air between two neighbouring targets, negative when they lie on each other;
//   * in the felt's own MILLIMETRES, whether a target leaves the counters zone it belongs to or
//     reaches into any other zone on the felt. That is the recipe's question and it cannot be
//     asked in pixels, because a tilted rectangle's bounding box is bigger than the rectangle.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5466'
const out = new URL('../../../../../docs/issues/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

const PROTOS = ['N', 'A', 'B', 'C']
const TABLE_SIZES = [
  [1280, 800],
  [1366, 1024],
  [1920, 1080],
]
const TV_SIZES = [
  [1920, 1080],
  [3840, 2160],
]
const SIZES = { bord: TABLE_SIZES, tv: TV_SIZES }
const SEATS = [2, 4, 8]
const COUNTERS = [1, 2, 3]
// What the PNGs are taken at: the fullest table on the smallest screen each mode is meant for.
const SHOT = { bord: [1280, 800], tv: [1920, 1080] }

const READ = `(() => {
  const boxOf = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden') return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? r : null }
  const root = document.querySelector('.byd-proto-page')
  const found = []
  for (const el of document.querySelectorAll('[data-proto-target]')) {
    const r = boxOf(el)
    if (!r) continue
    found.push({ id: el.dataset.protoTarget || '', r, covers: (el.dataset.protoCovers || '').split(' ').filter(Boolean), mm: el.dataset.protoMm ? JSON.parse(el.dataset.protoMm) : null })
  }
  // The air between two boxes; negative when they lie on each other.
  const between = (a, b) => Math.max(Math.max(a.left, b.left) - Math.min(a.right, b.right), Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
  const hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
  const pairs = []
  let gap = Infinity
  for (let i = 0; i < found.length; i++) for (let j = i + 1; j < found.length; j++) {
    const d = between(found[i].r, found[j].r)
    // Only neighbours are interesting: two chips at opposite rims of the table never met.
    if (d < 200) gap = Math.min(gap, d)
    if (hit(found[i].r, found[j].r)) pairs.push(found[i].id + ' X ' + found[j].id)
  }
  const r1 = (n) => Math.round(n * 10) / 10
  const boxes = found.map((f) => ({ id: f.id, w: r1(f.r.width), h: r1(f.r.height) }))
  const smallest = boxes.reduce((a, b) => (b.w * b.h < a.w * a.h ? b : a), { w: Infinity, h: Infinity })
  const biggest = boxes.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a), { w: 0, h: 0 })
  // What the target was SET to, before the tilt got at it.
  const setPx = (() => { const el = document.querySelector('[data-proto-target]'); return el ? r1(parseFloat(getComputedStyle(el).width)) : 0 })()

  // The millimetre reading: does a target stay inside the zone it belongs to, and does it reach
  // into another zone? Exact, because it is the felt's own coordinate system.
  const zones = JSON.parse(root?.dataset.protoZones || '[]')
  let outside = 0, intruding = 0
  const escapes = []
  for (const f of found) {
    if (!f.mm) continue
    const s = f.mm.side / 2
    const q = { l: f.mm.cx - s, t: f.mm.cy - s, r: f.mm.cx + s, b: f.mm.cy + s }
    const own = zones.find((z) => z.id === f.mm.zone)
    if (own && (q.l < own.x || q.t < own.y || q.r > own.x + own.w || q.b > own.y + own.h)) { outside++; escapes.push(f.id + ' ut ur ' + own.id) }
    for (const z of zones) if (z.id !== f.mm.zone && q.l < z.x + z.w && z.x < q.r && q.t < z.y + z.h && z.y < q.b) { intruding++; escapes.push(f.id + ' in i ' + z.id) }
  }
  // Do two zones on the felt now lie on each other? A seat that grew has to be paid for by
  // somebody, and K18's own gate counts exactly this (recipe-geometry.test.ts).
  let zonePairs = 0
  for (let i = 0; i < zones.length; i++) for (let j = i + 1; j < zones.length; j++) {
    const a = zones[i], b = zones[j]
    if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) zonePairs++
  }

  const card = document.querySelector('.byd-pile-top')
  const played = document.querySelector('.byd-card')
  const counters = zones.filter((z) => z.id.startsWith('counters:'))[0] || null
  const mine = zones.filter((z) => z.id.startsWith('mine:'))[0] || null
  return {
    targets: found.length,
    covered: found.reduce((n, f) => n + f.covers.length, 0),
    smallest: { w: smallest.w === Infinity ? 0 : smallest.w, h: smallest.h === Infinity ? 0 : smallest.h },
    biggest,
    setPx,
    boxes,
    collisions: pairs.length,
    pairs,
    // null, not 0: at one target per seat there may be no neighbour within reach at all, and a
    // zero would read as two targets touching.
    gap: Number.isFinite(gap) ? r1(gap) : null,
    outside,
    intruding,
    escapes: escapes.slice(0, 12),
    zonePairs,
    scale: Number(root?.dataset.protoScale || 0),
    feltMm: JSON.parse(root?.dataset.protoFelt || '{"w":0,"h":0}'),
    countersMm: counters ? { w: counters.w, h: counters.h } : null,
    mineMm: mine ? { w: mine.w, h: mine.h } : null,
    cardPx: card ? Math.round(card.getBoundingClientRect().width) : 0,
    playedPx: played ? Math.round(played.getBoundingClientRect().width) : 0,
  }
})()`

const browser = await chromium.launch()
const rows = []

// The felt is a noise texture and does not compress, so only the 1280 shots — the ones a reader
// zooms into — are taken at twice the device scale.
const open = async (width, height, url) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: width <= 1280 ? 2 : 1 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '.byd-proto-bar { display: none !important }' })
  // The felt settles a frame after the box it measures has been laid out, and the TV camera
  // glides into place after that.
  await page.waitForTimeout(900)
  return page
}

const url = (o) => `${base}/prototype/raknarzonen?proto=${o.proto}&yta=${o.mode}&seats=${o.seats ?? 4}&counters=${o.counters ?? 2}`

// ── The sweep: every variant, both modes, every screen, 2/4/8 seats, 1/2/3 counters. ──────────
for (const proto of PROTOS) {
  for (const mode of ['bord', 'tv']) {
    for (const [width, height] of SIZES[mode]) {
      for (const seats of SEATS) {
        for (const counters of COUNTERS) {
          const page = await open(width, height, url({ proto, mode, seats, counters }))
          const reading = await page.evaluate(READ)
          rows.push({ proto, mode, seats, counters, width, height, shot: 'svep', ...reading })
          console.log(
            `${proto} ${mode} ${width}x${height} ${seats}p ${counters}r`,
            JSON.stringify({ ytor: reading.targets, satt: reading.setPx, ruta: reading.smallest, par: reading.collisions, glapp: reading.gap, ut: reading.outside, in: reading.intruding, zonpar: reading.zonePairs, kort: reading.cardPx, filt: reading.feltMm }),
          )
          await page.close()
        }
      }
    }
  }
}

// ── The picture, at the setting the numbers are tightest in. ──────────────────────────────────
for (const proto of PROTOS) {
  for (const mode of ['bord', 'tv']) {
    const [width, height] = SHOT[mode]
    const page = await open(width, height, url({ proto, mode, seats: 8, counters: 3 }))
    const name = `proto89-${proto}-${mode}-${width}x${height}.png`
    await page.screenshot({ path: `${out}${name}` })
    console.log(name)
    await page.close()
  }
}

// ── The X-ray: the targets made visible, which is the only way to SEE what the pair count says. ─
for (const proto of PROTOS) {
  const page = await open(1280, 800, url({ proto, mode: 'bord', seats: 8, counters: 3 }))
  await page.evaluate(() => document.querySelector('.byd-proto-page')?.setAttribute('data-proto-xray', 'true'))
  await page.waitForTimeout(200)
  const name = `proto89-${proto}-bord-rontgen-3r-1280x800.png`
  await page.screenshot({ path: `${out}${name}` })
  console.log(name)
  await page.close()
}

// ── C's door to the individual counter: the pile's ring, and the chip's own ring behind it. ────
{
  const page = await open(1280, 800, url({ proto: 'C', mode: 'bord', seats: 4, counters: 3 }))
  const box = await page.locator('[data-proto-target]').first().boundingBox()
  if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(350)
  await page.screenshot({ path: `${out}proto89-C-bord-hogring-1280x800.png` })
  const ring = await page.evaluate(`(() => {
    const r = document.querySelector('.byd-radial')
    if (!r) return null
    const bs = [...r.querySelectorAll('button')].map((b) => b.getBoundingClientRect())
    const small = Math.min(...bs.map((b) => Math.min(b.width, b.height)))
    return { buttons: bs.length, smallest: Math.round(small * 10) / 10 }
  })()`)
  rows.push({ proto: 'C', mode: 'bord', seats: 4, counters: 3, width: 1280, height: 800, shot: 'hogring', ring })
  console.log('proto89-C-bord-hogring-1280x800.png', JSON.stringify(ring))
  await page.locator('.byd-radial button').first().click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}proto89-C-bord-brickring-1280x800.png` })
  const verbs = await page.locator('.byd-radial button').allTextContents()
  rows.push({ proto: 'C', mode: 'bord', seats: 4, counters: 3, width: 1280, height: 800, shot: 'brickring', verbs })
  console.log('proto89-C-bord-brickring-1280x800.png', JSON.stringify(verbs))
  await page.close()
}

writeFileSync(`${out}proto89-matt.json`, JSON.stringify(rows, null, 1))
console.log('proto89-matt.json', rows.length, 'rader')
await browser.close()

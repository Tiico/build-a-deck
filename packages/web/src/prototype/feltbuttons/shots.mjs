// PROTOTYPE — throwaway (#90). Drives the prototype route in real Chromium, measures every button
// on it against the ground it actually lands on, and writes one PNG per variant per mode plus a
// close-up of the ring and of the sheet, and every raw number.
//
//   pnpm --filter @byd/web exec vite --port 5467 --strictPort
//   node packages/web/src/prototype/feltbuttons/shots.mjs http://localhost:5467
//
// The screens are the ones the felt is meant to be read at: 1280 x 800 and 1920 x 1080 in table
// mode, 1920 x 1080 and 3840 x 2160 in TV mode (K9, C5). The played felt is not an editor, so
// L12 sends it to its own measures and not to 390 and 768.
//
// HOW THE GROUND IS FOUND. Not from a declaration. The page is screenshotted, the PNG is handed
// back into the page as a `data:` URL, drawn into a canvas, and the ground under and beside every
// button is read out of `getImageData` — the composited pixels, gradient, tilt, shadow and all.
// The felt is a `radial-gradient` and a ring's plate is translucent; neither has a
// `background-color` that a computed style would report. The button's own ink and line are read
// from the computed style and composited over that sampled ground, because a glyph's own pixels
// are antialiased against the ground and sampling them would measure the antialiasing instead.
// The measurement itself is `measure.ts` — the same code the note at the bottom of the screen
// uses — reached through `window.proto90`, so there is one implementation and not two.
import { mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const base = process.argv[2] ?? 'http://localhost:5467'
const out = new URL('../../../../../docs/issues/', import.meta.url).pathname
mkdirSync(out, { recursive: true })

const PROTOS = ['N', 'A', 'B', 'C']
const SCENES = ['filt', 'ark']
const SIZES = {
  bord: [
    [1280, 800],
    [1920, 1080],
  ],
  tv: [
    [1920, 1080],
    [3840, 2160],
  ],
}
const SEATS = [2, 4, 8]
// What the PNGs are taken at: the fullest table on the screen each mode is meant for.
const SHOT = { bord: [1280, 800], tv: [1920, 1080] }

// `lang=sv` because the sheet's own words are the tool's, and these shots are read in Swedish
// (A4: a surface mounted on its own speaks the catalogue's language, but a browser asking for
// English gets English, and a shot of `Cancel` would be a shot of the wrong felt).
const url = (o) => `${base}/prototype/filtens-knappar?lang=sv&proto=${o.proto}&yta=${o.mode}&seats=${o.seats ?? 4}&scen=${o.scene ?? 'filt'}`

// The switcher is the prototype's own chrome and is never in a shot or in a measurement.
const open = async (width, height, address, scale = 1) => {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: scale })
  await page.goto(address, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '.byd-proto-bar { display: none !important }' })
  // The felt settles a frame after the box it measures has been laid out, the rings are anchored
  // off the nodes it drew, and the TV camera glides into place after that.
  await page.waitForTimeout(900)
  return page
}

// Screenshot → canvas → sampler → `measure.ts`. The screenshot is taken at device scale 1 for a
// measuring page, so a canvas pixel and a CSS pixel are the same pixel.
async function measure(page) {
  const png = (await page.screenshot()).toString('base64')
  return page.evaluate(async (data) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const sample = (x, y) => {
      const px = Math.round(x)
      const py = Math.round(y)
      if (px < 0 || py < 0 || px >= pixels.width || py >= pixels.height) return null
      const i = (py * pixels.width + px) * 4
      return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]]
    }
    return window.proto90(sample)
  }, png)
}

const browser = await chromium.launch()
const rows = []
let measured = 0
let failed = 0

// ── The sweep: every position, both surfaces, both scenes, every screen, 2 / 4 / 8 seats. ──────
for (const proto of PROTOS) {
  for (const mode of ['bord', 'tv']) {
    for (const [width, height] of SIZES[mode]) {
      for (const scene of SCENES) {
        for (const seats of SEATS) {
          const page = await open(width, height, url({ proto, mode, seats, scene }))
          const reading = await measure(page)
          await page.close()
          if (!reading || reading.count === 0) throw new Error(`${proto} ${mode} ${width}x${height} ${scene} ${seats}p mätte noll knappar`)
          if (!reading.sampled) throw new Error(`${proto} ${mode} ${width}x${height} ${scene} ${seats}p föll tillbaka på beräknad grund`)
          rows.push({ proto, mode, scene, seats, width, height, ...reading })
          measured += reading.count
          failed += reading.failures.length
          console.log(`\n${proto} ${mode} ${width}x${height} ${scene} ${seats}p — ${reading.count} knappar, ${reading.failures.length} under gränsen`)
          for (const b of reading.buttons) {
            const mark = (g, gate) => (g === null ? '     —    ' : `${g.ratio.toFixed(2).padStart(6)}:1 ${g.ratio >= gate ? 'OK  ' : 'FALL'}`)
            console.log(
              `  ${b.where.padEnd(14)} ${b.label.padEnd(14)} grund ${b.ground} ute ${b.outside}` +
                `  text ${mark(b.text, 4.5)}  linje ${mark(b.line, 3)}  stapel ${mark(b.bar, 3)}` +
                `  platta ${b.plate === null ? '  —  ' : `${b.plate.toFixed(2)}:1`}${b.disabled ? '  (avstängd, utanför gränserna)' : ''}`,
            )
          }
          for (const f of reading.failures) console.log(`  UNDER GRÄNSEN: ${f}`)
        }
      }
    }
  }
}

// ── The picture: the felt with both rings open, and the sheet. ─────────────────────────────────
for (const proto of PROTOS) {
  for (const mode of ['bord', 'tv']) {
    const [width, height] = SHOT[mode]
    // The felt is a noise-free gradient but the wood is not, so the 1280 shots — the ones a reader
    // zooms into — are taken at twice the device scale.
    const page = await open(width, height, url({ proto, mode, seats: 4, scene: 'filt' }), width <= 1280 ? 2 : 1)
    const name = `proto90-${proto}-${mode}-${width}x${height}.png`
    await page.screenshot({ path: `${out}${name}` })
    console.log(name)
    await page.close()
  }
}

// ── The close-ups: the ring, and the sheet with all three roles in one view. ───────────────────
for (const proto of PROTOS) {
  {
    const page = await open(1280, 800, url({ proto, mode: 'bord', seats: 4, scene: 'filt' }), 2)
    const ring = await page.locator('[data-radial="raknare"]').first()
    const at = await ring.boundingBox()
    // The ring's own box is zero-sized — it is a point with buttons hung around it — so the
    // close-up is the circle the buttons stand on, plus air.
    const clip = at ? { x: Math.max(0, at.x - 150), y: Math.max(0, at.y - 150), width: 300, height: 300 } : undefined
    const name = `proto90-${proto}-bord-ringen-1280x800.png`
    await page.screenshot({ path: `${out}${name}`, ...(clip ? { clip } : {}) })
    console.log(name)
    await page.close()
  }
  {
    const page = await open(1280, 800, url({ proto, mode: 'bord', seats: 4, scene: 'ark' }), 2)
    const sheet = await page.locator('[data-set-value]').first().boundingBox()
    const clip = sheet ? { x: Math.max(0, sheet.x - 24), y: Math.max(0, sheet.y - 24), width: sheet.width + 48, height: sheet.height + 48 } : undefined
    const name = `proto90-${proto}-bord-arket-1280x800.png`
    await page.screenshot({ path: `${out}${name}`, ...(clip ? { clip } : {}) })
    console.log(name)
    await page.close()
  }
}

writeFileSync(`${out}proto90-matt.json`, JSON.stringify(rows, null, 1))
// Printed so an empty list cannot pass for a clean sweep.
console.log(`\nproto90-matt.json — ${rows.length} mätpunkter, ${measured} knappar mätta, ${failed} under L13:s gränser`)
await browser.close()

// Packar mätningarna till ../data.js och de bilder prototypen visar till ../img (#749).
// Bilderna kodas om till JPEG (kvalitet 72) så att mappen håller sig liten.
//
//   node mk-data.mjs <ut-katalog> <results-fil> [fler results-filer…]
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const W = join(HERE, '..', '..', '..', '..', '..')
const { jpegjs, PNG } = createRequire(import.meta.url)(join(W, 'node_modules/.pnpm/playwright-core@1.63.0/node_modules/playwright-core/lib/utilsBundle.js'))
const OUT = process.argv[2]
const files = process.argv.slice(3)
const IMG = join(HERE, '..', 'img')
mkdirSync(IMG, { recursive: true })

const rows = files.flatMap((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')))
const sizes = JSON.parse(readFileSync(join(OUT, 'sizes.json'), 'utf8'))
const nav = existsSync(join(OUT, 'nav-nu_a_b_c_d_b0-light.json')) ? JSON.parse(readFileSync(join(OUT, 'nav-nu_a_b_c_d_b0-light.json'), 'utf8')) : []

// Bilden i den storlek den visas i: en TV halveras, telefonen står kvar.
function copy(src, dst) {
  const from = join(OUT, 'img', src)
  if (!existsSync(from)) return null
  let img
  if (src.endsWith('.png')) {
    const p = PNG.sync.read(readFileSync(from))
    img = { width: p.width, height: p.height, data: p.data }
    if (img.width > 1000) img = half(img)
  } else img = jpegjs.decode(readFileSync(from), { useTArray: true })
  writeFileSync(join(IMG, dst), jpegjs.encode(img, 72).data)
  return dst
}
function half(img) {
  const w = img.width >> 1, h = img.height >> 1, d = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) {
    const s = (i, j) => img.data[((y * 2 + j) * img.width + (x * 2 + i)) * 4 + c]
    d[(y * w + x) * 4 + c] = (s(0, 0) + s(1, 0) + s(0, 1) + s(1, 1)) >> 2
  }
  return { width: w, height: h, data: d }
}

const MOMENTS = { '1s': '1s', '55s': '55s', fore: 'fore', efter: 'efter' }
const data = rows.map((r) => {
  const t = r.throttled ?? {}
  const keep = r.scheme === 'dark' || r.v === 'nu' || r.v === 'b'
  const img = {}
  if (keep) for (const [k, m] of Object.entries(MOMENTS)) img[k] = copy(`${r.v}-${r.route}-${r.scheme}-${m}.jpg`, `${r.v}-${r.route}-${r.scheme}-${k}.jpg`)
  if (r.scheme === 'dark') img.nojs = copy(`${r.v}-${r.route}-dark-nojs.png`, `${r.v}-${r.route}-nojs.jpg`)
  const min = (xs) => (xs && xs.length ? Math.min(...xs.map((c) => c.ratio)) : null)
  return {
    v: r.v, route: r.route, scheme: r.scheme, img,
    responseEnd: t.responseEnd, cssEnd: t.cssEnd, entryEnd: t.entryEnd, fp: t.paint?.['first-paint'] ?? null, fcp: t.paint?.['first-contentful-paint'] ?? null,
    takeover: t.takeover, whiteUntil: t.whiteUntil, whiteFrames: t.whiteFrames, firstNonWhite: t.firstNonWhite, cls: t.cls, takeoverDiff: t.takeoverDiff,
    at55: r.at55?.text ?? '', at55takeover: r.at55?.takeover ?? null,
    text1: r.text1 ?? null, text5: r.text5 ?? null, contrast: min(r.contrast), contrastSlow: min(r.contrastSlow),
    nojs: r.nojs?.text ?? null,
  }
})
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs, sizes.mjs och nav.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.SKAL = ${JSON.stringify({ rows: data, sizes, nav })}\n`)
console.log('rader', data.length, 'bilder', data.reduce((n, r) => n + Object.values(r.img).filter(Boolean).length, 0))

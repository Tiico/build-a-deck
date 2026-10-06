// Packar mätningarna till ../data.js och de bilder prototypen visar till ../img (#749).
// Bilderna kodas om till JPEG (kvalitet 72) så att mappen håller sig liten.
//
//   node mk-data.mjs <ut-katalog> <results-fil> [fler results-filer…]
import { createHash } from 'node:crypto'
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

// En senare fil vinner över en tidigare för samma variant, route och läge (en ommätning av bara
// det strypta passet behåller kontrasten och utan-JS-raden från det första).
const merged = new Map()
for (const r of files.flatMap((f) => JSON.parse(readFileSync(join(OUT, f), 'utf8')))) {
  const k = `${r.v}/${r.route}/${r.scheme}`
  merged.set(k, { ...merged.get(k), ...r })
}
const rows = [...merged.values()]
const sizes = JSON.parse(readFileSync(join(OUT, 'sizes.json'), 'utf8'))
const nav = existsSync(join(OUT, 'nav-nu_a_b_c_d_b0-light.json')) ? JSON.parse(readFileSync(join(OUT, 'nav-nu_a_b_c_d_b0-light.json'), 'utf8')) : []

// Bilden i den storlek den visas i: en TV halveras, telefonen står kvar.
const seen = new Map()
function copy(src, dst) {
  const from = join(OUT, 'img', src)
  if (!existsSync(from)) return null
  let img
  if (src.endsWith('.png')) {
    const p = PNG.sync.read(readFileSync(from))
    img = { width: p.width, height: p.height, data: p.data }
    if (img.width > 1000) img = half(img)
  } else img = jpegjs.decode(readFileSync(from), { useTArray: true })
  // En ram som redan finns (ett skal som stod still mellan 5,5 s och övertagandet) sparas en gång.
  const bytes = jpegjs.encode(img, 72).data
  const key = createHash('sha1').update(bytes).digest('hex')
  if (seen.has(key)) return seen.get(key)
  seen.set(key, dst)
  writeFileSync(join(IMG, dst), bytes)
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
  // Mappen ska hålla sig under ~2,5 MB. Skalen är mörka i båda systemlägena, så ljust läge får
  // bara vid 1 s, och bara för Nu och B. B0 är en teknisk jämförelse och får bara 1 s och 5,5 s.
  // Utan JS ser varje route likadan ut, så den bilden tas på TV:n, telefonen och editorn.
  const want = (k) => (r.scheme === 'light' ? k === '1s' && (r.v === 'nu' || r.v === 'b') : r.v !== 'b0' || k === '1s' || k === '55s')
  const img = {}
  for (const [k, m] of Object.entries(MOMENTS)) if (want(k)) img[k] = copy(`${r.v}-${r.route}-${r.scheme}-${m}.jpg`, `${r.v}-${r.route}-${r.scheme}-${k}.jpg`)
  if (r.scheme === 'dark' && r.v !== 'b0' && ['tv', 'play', 'editor'].includes(r.route)) img.nojs = copy(`${r.v}-${r.route}-dark-nojs.png`, `${r.v}-${r.route}-nojs.jpg`)
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

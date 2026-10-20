// PROTOTYP — kastas (#1061). Samlar shoot.mjs resultat i ../data.js, den enda fil prototypsidan
// läser, och gör bilderna sidan visar till PNG med 64 färger i ../img (Pillow): hela fönstret i
// 1× och en lupp i 2× runt ×:et som frågade, frågan och foten.
//   node mk-data.mjs <katalog med results-*.json och png>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = process.argv[2]
const IMG = join(HERE, '..', 'img')
mkdirSync(IMG, { recursive: true })
const rows = new Map()
const byAge = (f) => statSync(join(DIR, f)).mtimeMs
for (const f of readdirSync(DIR).filter((f) => f.startsWith('results-')).sort((a, b) => byAge(a) - byAge(b))) {
  for (const r of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) rows.set(`${r.v}|${r.s}`, r)
}
const out = []
for (const r of rows.values()) {
  let f = null
  let lupp = null
  if (r.file) {
    f = r.file
    lupp = r.file.replace('.png', '-lupp.png')
    const d = r.dpr
    // The × that asked, the question and the foot: what the eye has to cover, and nothing else.
    const boxes = [r.foot, r.q, r.doorBefore && { x: r.doorBefore.x, y: r.row?.y ?? r.q.y, w: r.doorBefore.w, h: 44 }].filter(Boolean)
    const x0 = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 12)
    const y0 = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 12)
    const x1 = Math.min(r.winW, Math.max(...boxes.map((b) => b.x + b.w)) + 12)
    const y1 = Math.min(r.winH, Math.max(...boxes.map((b) => b.y + b.h)) + 12)
    const box = [x0 * d, y0 * d, x1 * d, y1 * d].map(Math.round)
    execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(${JSON.stringify(join(DIR, r.file))}).convert('RGB')
q = lambda i: i.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q(im.resize((${r.winW}, ${r.winH}), Image.LANCZOS)).save(${JSON.stringify(join(IMG, f))}, optimize=True)
l = im.crop(tuple(${JSON.stringify(box)}))
if l.width > 1400: l = l.resize((1400, round(l.height * 1400 / l.width)), Image.LANCZOS)
q(l).save(${JSON.stringify(join(IMG, lupp))}, optimize=True)`])
  }
  const { file, ...m } = r
  out.push({ ...m, f, lupp })
}
out.sort((a, b) => (a.v + a.s).localeCompare(b.v + b.s))
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på den byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler', out.filter((o) => o.f).length, 'bilder')

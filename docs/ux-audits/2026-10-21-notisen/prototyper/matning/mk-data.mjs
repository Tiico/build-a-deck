// PROTOTYP — kastas (#1073). Samlar shoot.mjs resultat i ../data.js, den enda fil prototypsidan
// läser, och gör bilderna sidan visar till PNG med 64 färger i ../img (Pillow): hela fönstret i 1×
// och en lupp i 2× över huvudet, notisen och arbetets överkant.
//   node mk-data.mjs <katalog med results-*.json och png>
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = process.argv[2]
const IMG = join(HERE, '..', 'img')
mkdirSync(IMG, { recursive: true })
const rows = new Map()
for (const f of readdirSync(DIR).filter((f) => f.startsWith('results-')).sort()) {
  for (const r of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) rows.set(`${r.v}|${r.s}|${r.key}`, r)
}
const out = []
for (const r of rows.values()) {
  let f = null
  let lupp = null
  // Bilder av ångrans mening på alla ytor; de andra meningarna står i talen.
  if (r.file && r.key === 'undo-kortleken') {
    f = r.file
    lupp = r.file.replace('.png', '-lupp.png')
    const bottom = Math.min(r.h, Math.max(r.workTop, r.box.y + r.box.h) + 24)
    const box = [0, 0, r.w * 2, bottom * 2]
    execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(${JSON.stringify(join(DIR, r.file))}).convert('RGB')
q = lambda i: i.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
q(im.resize((${r.w}, ${r.h}), Image.LANCZOS)).save(${JSON.stringify(join(IMG, f))}, optimize=True)
l = im.crop(tuple(${JSON.stringify(box)}))
if l.width > 1400: l = l.resize((1400, round(l.height * 1400 / l.width)), Image.LANCZOS)
q(l).save(${JSON.stringify(join(IMG, lupp))}, optimize=True)`])
  }
  const { file, ...m } = r
  out.push({ ...m, f, lupp })
}
out.sort((a, b) => `${a.v}${a.s}${a.key}`.localeCompare(`${b.v}${b.s}${b.key}`))
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på den byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler', out.filter((o) => o.f).length, 'bilder')

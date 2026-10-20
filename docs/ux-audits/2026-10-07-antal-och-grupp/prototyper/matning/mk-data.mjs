// PROTOTYP — kastas (#695). Samlar shoot.mjs resultat i ../data.js, den enda fil prototypsidan
// läser, och gör varje bild som sidan visar till en liten PNG med 64 färger i ../img (Pillow).
// Linux-ytorna (+15 % text) mäts alla men fotograferas bara vid 1024 för provleken, där det är
// trängst; resten är tal i tabellen.
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
const shown = (s) => (!s.includes('linux') || s === 'prov-1024-linux') && s !== 'tat-1440'
const out = []
for (const r of rows.values()) {
  let jpg = null
  if (shown(r.s)) {
    // The editor's own top bar is the same in every shot and is cut off; what is left is kept as
    // a 64-colour PNG, which keeps the table's text sharper than a JPEG of the same weight.
    jpg = r.file
    execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(${JSON.stringify(join(DIR, r.file))}).convert('RGB')
im = im.crop((0, 58, im.width, im.height))
im.quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(${JSON.stringify(join(IMG, jpg))}, optimize=True)`])
  }
  const { file, others, ...m } = r
  out.push({ ...m, others: others.map((o) => `${o.name}:${o.state}`), f: jpg })
}
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler')

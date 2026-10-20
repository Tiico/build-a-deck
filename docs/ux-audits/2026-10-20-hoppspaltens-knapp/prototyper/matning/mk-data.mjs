// PROTOTYP — kastas (#1019). Samlar shoot.mjs resultat i ../data.js, den enda fil prototypsidan
// läser, och gör bilderna sidan visar till PNG med 64 färger i ../img (Pillow): kronan och det
// översta av väggen och spalten under den, och en lupp runt kontrollen.
// Alla ytor mäts; bilder görs av de svenska i Macens typsnitt, av 1280 bredvid AI-panelen i det
// breda typsnittet, och av 1280 bredvid panelen på engelska.
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
const shown = (s) => /-sv-mac-/.test(s) || /^1280-ai-(sv-bred|en-mac)-/.test(s)
const out = []
for (const r of rows.values()) {
  let f = null
  let lupp = null
  if (r.file && shown(r.s)) {
    f = r.file
    lupp = r.file.replace('.png', '-lupp.png')
    const d = r.dpr
    const c = r.crownRect
    const k = r.rect
    // The crown and 300 px of what stands under it; and the control with 150 px either side.
    const crop = [0, Math.max(0, c.y - 10) * d, r.winW * d, (c.y + c.h + 300) * d].map(Math.round)
    const lx = Math.max(0, k.x - 150)
    const luppBox = [lx * d, Math.max(0, k.y - 14) * d, Math.min(r.winW, k.x + k.w + 150) * d, (k.y + k.h + 14) * d].map(Math.round)
    execFileSync('python3', ['-c', `from PIL import Image
im = Image.open(${JSON.stringify(join(DIR, r.file))}).convert('RGB')
for box, name in ((${JSON.stringify(crop)}, ${JSON.stringify(f)}), (${JSON.stringify(luppBox)}, ${JSON.stringify(lupp)})):
    im.crop(tuple(box)).quantize(colors=64, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(${JSON.stringify(IMG)} + '/' + name, optimize=True)`])
  }
  const { file, rect, crownRect, ...m } = r
  out.push({ ...m, f, lupp })
}
out.sort((a, b) => (a.v + a.s).localeCompare(b.v + b.s))
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på den byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler', out.filter((o) => o.f).length, 'bilder')

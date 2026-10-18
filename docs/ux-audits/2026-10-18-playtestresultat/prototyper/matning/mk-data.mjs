// Gathers the driver's results into ../data.js, the one file the prototype page reads, and turns
// each shot into a JPEG in ../img (sips, which every Mac has).
//   node mk-data.mjs <katalog med results-*.json och png>
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  for (const r of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) rows.set(`${r.v}|${r.s}|${r.w}`, r)
}
// A shot that is pixel for pixel another one is stored once, so the folder stays small.
const seen = new Map()
const jpeg = (png, width, q) => {
  const sum = createHash('md5').update(readFileSync(join(DIR, png))).digest('hex')
  if (seen.has(sum)) return seen.get(sum)
  const out = png.replace(/\.png$/, '.jpg')
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(q), '--resampleWidth', String(width), join(DIR, png), '--out', join(IMG, out)], { stdio: 'ignore' })
  seen.set(sum, out)
  return out
}
const width = (png) => Number(execFileSync('sips', ['-g', 'pixelWidth', join(DIR, png)]).toString().match(/pixelWidth: (\d+)/)[1])
const out = []
for (const r of rows.values()) {
  // The window at 1× its CSS pixels (it was shot at 2×); the whole variant, unscrolled, at 1× too
  // but never wider than 900 px.
  const full = jpeg(`${r.file}-full.png`, r.w, 50)
  const crop = jpeg(`${r.file}-crop.png`, Math.min(900, Math.round(width(`${r.file}-crop.png`) / 2)), 62)
  const { file, model, ...m } = r
  out.push({ ...m, full, crop })
}
writeFileSync(join(HERE, '..', 'data.js'), `// Fotograferat av matning/shoot.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler')

// Gathers the driver's results into ../data.js, the one file the prototype page reads, and turns
// each shot into a small JPEG in ../img (sips, which every Mac has).
//   node mk-data.mjs <katalog med results-*.json och png>
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
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
const out = []
for (const r of rows.values()) {
  // The column is shot at twice the pixels and kept at 1.5×, so the row's letters stay readable.
  // The column is 220 px at every width and measured the same at 1440 as at 1280, so 1440 shows
  // 1280's picture and the folder stays under 2,5 MB. The whole frame is kept for the two Swedish
  // decks only; the English one looks like the Swedish one beside the list.
  const col = r.w === 1440 ? `${r.v}-${r.s}-1280-col.jpg` : jpeg(`${r.file}-col.png`, 330, 60)
  const frame = r.s !== 'long' && existsSync(join(DIR, `${r.file}-frame.png`)) ? jpeg(`${r.file}-frame.png`, 960, 50) : null
  const { file, aria, ...m } = r
  out.push({ ...m, col, frame, aria })
}
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler')

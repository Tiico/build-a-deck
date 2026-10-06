// Gathers the driver's results into ../data.js, the one file the prototype page reads, and turns
// each shot into a small JPEG in ../img (sips, which every Mac has).
//   node mk-data.mjs <katalog med results-*.json och png> [flow.json]
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = process.argv[2]
const FLOW = process.argv[3]
const IMG = join(HERE, '..', 'img')
mkdirSync(IMG, { recursive: true })
const rows = new Map()
const byAge = (f) => statSync(join(DIR, f)).mtimeMs
for (const f of readdirSync(DIR).filter((f) => f.startsWith('results-')).sort((a, b) => byAge(a) - byAge(b))) {
  for (const r of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) rows.set(`${r.v}|${r.s}`, r)
}
const out = []
// A shot that is pixel for pixel another one (the picker on a phone is the same in every variant)
// is stored once, so the folder stays small.
const seen = new Map()
for (const r of rows.values()) {
  const sum = createHash('md5').update(readFileSync(join(DIR, r.file))).digest('hex')
  let jpg = seen.get(sum)
  if (!jpg) {
    jpg = r.file.replace(/\.png$/, '.jpg')
    seen.set(sum, jpg)
    // TV shots are the biggest and the busiest: 1920 is kept at 1440 wide, and they get a little
    // less quality than the forms.
    const q = r.s.startsWith('tv') || r.s.startsWith('bord') ? '55' : '62'
    const size = r.s === 'tv-1920' ? ['--resampleWidth', '1440'] : []
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', q, ...size, join(DIR, r.file), '--out', join(IMG, jpg)], { stdio: 'ignore' })
  }
  const { file, said, ...m } = r
  out.push({ ...m, f: jpg })
}
const flow = FLOW ? JSON.parse(readFileSync(FLOW, 'utf8')) : {}
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs och matning/flow.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\nwindow.FLOW = ${JSON.stringify(flow)}\n`)
console.log(out.length, 'celler')

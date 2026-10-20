// Gathers the driver's results into ../data.js, the one file the prototype page reads, and copies
// the shots into ../img (full screens as JPEG, the enlarged crops as PNG so their pixels are exact).
//   node mk-data.mjs <katalog med results-*.json>
import { execFileSync } from 'node:child_process'
import { copyFileSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const IMG = join(HERE, '..', 'img')
const DIR = process.argv[2]
const rows = new Map()
// Oldest first, so that a later run of a variant replaces an earlier one.
const byAge = (f) => statSync(join(DIR, f)).mtimeMs
for (const f of readdirSync(DIR).filter((f) => f.startsWith('results-')).sort((a, b) => byAge(a) - byAge(b))) {
  for (const r of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) rows.set(`${r.v}|${r.s}|${r.seats}|${r.state}`, r)
}
const out = [...rows.values()].map((r) => {
  if (r.file) {
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', join(DIR, r.file + '.png'), '--out', join(IMG, r.file + '.jpg')], { stdio: 'ignore' })
    copyFileSync(join(DIR, r.file + '-nara.png'), join(IMG, r.file + '-nara.png'))
  }
  return {
    v: r.v, y: r.s, p: r.seats, st: r.state, f: r.file,
    left: r.anyName.length,
    piles: r.piles.filter((p) => p.where).map((p) => ({ z: p.zone, at: p.where, word: p.word, shown: p.shown, whole: p.whole, px: p.px, meets: p.meets, near: p.nearest, painted: p.painted, card: p.card.w })),
  }
})
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler')

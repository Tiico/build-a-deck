// Gathers the driver's results into ../data.js, the one file the prototype page reads.
//   node mk-data.mjs <katalog med results-*.json>
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const DIR = process.argv[2]
const rows = new Map()
// Oldest first, so that a later run of a variant replaces an earlier one.
const byAge = (f) => statSync(join(DIR, f)).mtimeMs
for (const f of readdirSync(DIR).filter((f) => f.startsWith('results-')).sort((a, b) => byAge(a) - byAge(b))) {
  for (const r of JSON.parse(readFileSync(join(DIR, f), 'utf8'))) rows.set(`${r.v}|${r.s}|${r.seats}`, r)
}
const out = [...rows.values()].map((r) => ({
  v: r.v, y: r.s, p: r.seats, f: r.file.replace(/\.png$/, '.jpg'),
  over: r.over, inZone: r.inZone, onPlate: r.onPlate, onZoneName: r.onZoneName, onHand: r.onHand, onChrome: r.onChrome, cut: r.cut,
  wide: r.wide, px: r.smallest, card: r.card, shrink: r.shrink, plates: r.plates.length,
  said: Object.fromEntries(Object.entries(r.said ?? {}).filter(([k]) => !k.startsWith('_'))),
}))
writeFileSync(join(HERE, '..', 'data.js'), `// Mätt av matning/shoot.mjs på det byggda appen; genererad av matning/mk-data.mjs.\nwindow.MATT = ${JSON.stringify(out)}\n`)
console.log(out.length, 'celler')

// Vad varje variants skal lägger till i index.html, rått, gzip och brotli (som lådan serverar det,
// DRIFT §13) — det telefonen betalar före första målningen (L20, #760).
//
//   node sizes.mjs <ut-katalog> nu,a,b,c,d,b0
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
const OUT = process.argv[2]
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
const weigh = (b) => ({ raw: b.length, gzip: gzipSync(b, { level: 9 }).length, br: brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length })
const nu = weigh(readFileSync(join(OUT, 'index-nu.html')))
const rows = VARIANTS.map((v) => {
  const w = weigh(readFileSync(join(OUT, `index-${v}.html`)))
  return { v, ...w, plus: { raw: w.raw - nu.raw, gzip: w.gzip - nu.gzip, br: w.br - nu.br } }
})
for (const r of rows) console.log(r.v.padEnd(4), `${r.raw}/${r.gzip}/${r.br}`, `+${r.plus.raw}/+${r.plus.gzip}/+${r.plus.br}`)
writeFileSync(join(OUT, 'sizes.json'), JSON.stringify(rows, null, 2))

// PROTOTYP — kastas (#1061). Mätningen i tre parallella shoot.mjs, en per bredd.
//   node run3.mjs <ut-katalog>
import { spawn } from 'node:child_process'
import { mkdirSync, openSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.argv[2] ?? join(HERE, 'shots')
mkdirSync(OUT, { recursive: true })
const runs = ['1024', '1280', '1440'].map((w) => {
  const ytor = []
  for (const l of ['sv', 'en']) for (const f of ['mac', 'bred']) for (const d of ['tat-stamning', 'tat-body', 'prov-body']) ytor.push(`${w}-${l}-${f}-${d}`)
  const log = openSync(join(OUT, `log-${w}.txt`), 'w')
  const child = spawn(process.execPath, [join(HERE, 'shoot.mjs'), OUT, 'nu,a,b,c,d', ytor.join(',')], { stdio: ['ignore', log, log] })
  return new Promise((done) => child.on('exit', done))
})
console.log('klart', await Promise.all(runs))

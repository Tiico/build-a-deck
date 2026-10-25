// Seeds the corpus with scripted sessions so the gate exists before the first real log.
// Real logs, exported from a running server, replace these over time.
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { SEATS, registry } from '../test/fixture.js'
import { SCRIPTED } from './scripted.js'
import { record, write } from './corpus.js'

const dir = join(import.meta.dirname, '../../../corpus')
// A recorded entry is never rewritten (DRIFT §7): seeding again writes only the entries not yet there.
for (const [name, script] of SCRIPTED) {
  if (existsSync(join(dir, `${name}.json`))) continue
  const h = script()
  const file = write(record(name, 'v1', h.initial.setup, h.log, registry), dir)
  console.log(JSON.stringify({ msg: 'seeded', file, lines: h.log.length, viewers: SEATS.length + 1 }))
}

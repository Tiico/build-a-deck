// The restore rehearsal's word on the designers' AI keys (DRIFT §5, #999): the `ai-keys` line
// `ops/restore.sh` prints from the restored database, opened with a master key made for this run and
// never the box's. Every key must read as none — «ange nyckeln igen» — and the run fails if one opens.
//   node … ai-keys-check.ts < ai-keys.json
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { restoredKeysOpened, type RestoredKeyRow } from '../src/ai-keys.js'

const input = JSON.parse(readFileSync(process.argv[2] ?? '/dev/stdin', 'utf8')) as { keys: RestoredKeyRow[] }
const checked = await restoredKeysOpened(input.keys, randomBytes(32))
console.log(JSON.stringify({ msg: 'ai-keys-checked', ...checked, says: checked.opened === 0 ? 'ange nyckeln igen' : 'a key opened without the box’s master key' }))
if (checked.opened > 0) process.exit(1)

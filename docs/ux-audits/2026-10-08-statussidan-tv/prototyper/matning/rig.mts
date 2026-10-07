// Engångsrigg för prototypen till #925: e2e-stacken (det byggda appen på ett origin, som på lådan)
// och två bord: ett som lever, och ett som avslutats med `session.end`.
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   ./node_modules/.bin/tsx rig.mts links.json
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deckFromProject } from '@byd/server'
import { setupFromProject } from '@byd/server/doc'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { gameDoc } = await import(`${W}/packages/e2e/support/game.ts`)
const { Host } = await import(`${W}/packages/e2e/support/host.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store)
const origin: string = stack.origin
type Made = { id: string; code: string; hostKey: string }
const table = async (): Promise<Made> => {
  const doc = gameDoc({ players: 4 })
  const res = await fetch(`${origin}/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'proto925', setup: setupFromProject(doc), deck: deckFromProject(doc) }) })
  if (res.status !== 201) throw new Error(`${res.status} ${await res.text()}`)
  return (await res.json()) as Made
}
const live = await table()
const ended = await table()
const host = await Host.open(origin, { session: ended.id, hostKey: ended.hostKey } as never)
await host.send([{ v: 'session.end' } as never])
const url = (t: { id: string; hostKey: string }, mode: string) => `${origin}/table?session=${encodeURIComponent(t.id)}&host=${encodeURIComponent(t.hostKey)}&mode=${mode}`
const gone = { id: 'finnsinte925', hostKey: 'x' }
const links = {
  origin,
  live: { tv: url(live, 'tv'), table: url(live, 'table') },
  ended: { tv: url(ended, 'tv'), table: url(ended, 'table') },
  missing: { tv: url(gone, 'tv'), table: url(gone, 'table') },
}
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => {
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

// Engångsrigg för prototypen till #1061: e2e-stacken (den byggda appen på ett origin, som på lådan)
// och två lekar i ett konto — provleken Sal's Saloon som den är, och samma lek skalad genom API:t
// till 308 kort och elva fält, exakt som `table-antal-rail.spec.ts` skalar den («stämning» är
// fältet med långa värden, och den som frågan i issuet handlar om).
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   node_modules/.bin/tsx rig.mts links.json
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const W = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const { start } = await import(`${W}/packages/e2e/support/stack.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)

const OUT = process.argv[2] ?? 'links.json'
const stack = await start()
console.log('stack', stack.origin, stack.store)
const origin = stack.origin

function tät() {
  const doc = spelkortDoc(4)
  const SERIE = ['Grundlek', 'Guldrush', 'Ökenvinden', 'Saloonkriget']
  const KONST = ['A. Lind', 'Moa Berg', 'J. Öst', 'Sixten Ek', 'Lo Holm']
  const STÄM = ['Dammet lägger sig över gatan.', 'Någon spelar fel på pianot igen.', 'Sheriffen tittar åt andra hållet.', 'Whiskyn är urvattnad, men billig.', 'Hästarna är oroliga i natt.']
  const rows = [0, 1, 2, 3].flatMap((lap) =>
    doc.rows.map((row: { id: string; fields: Record<string, unknown> }, i: number) => {
      const n = lap * doc.rows.length + i
      return {
        id: lap === 0 ? row.id : `${row.id}-${lap + 1}`,
        fields: { ...row.fields, kostnad: String((n * 7) % 9), kraft: String((n * 5) % 12), serie: SERIE[lap]!, konstnär: KONST[n % 5]!, stämning: STÄM[n % 5]!, version: `1.${n % 4}`, sida: n % 2 === 0 ? 'framsida' : 'båda' },
      }
    }),
  )
  return { ...doc, name: "Sal's Saloon, tät", rows }
}

const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto1061@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const make = async (doc: unknown) => {
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(doc) })
  if (p.status !== 201) throw new Error(`project: ${p.status} ${await p.text()}`)
  return `/editor?project=${encodeURIComponent(((await p.json()) as { id: string }).id)}`
}
const links = { origin, cookie, prov: await make(spelkortDoc(4)), tat: await make(tät()) }
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => {
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

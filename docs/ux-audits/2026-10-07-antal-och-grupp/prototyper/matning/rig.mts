// Engångsrigg för prototypen till #695: e2e-stacken (det byggda appen på ett origin, som på lådan)
// och två lekar i samma konto.
//
// - «prov»: provleken Sal's Saloon som den är, alltså det en ny formgivare ser (speltestet
//   2026-10-02 öppnade just den).
// - «tät»: samma lek skalad genom API:t till 308 kort och sju kolumner till (kostnad, kraft,
//   serie, konstnär, stämning, version, sida), eftersom provleken döljer täthet.
//
//   cd matning && ln -s ../../../../../packages/e2e/node_modules node_modules
//   ../../../../../packages/e2e/node_modules/.bin/tsx rig.mts links.json
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
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto695@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }
const make = async (doc: unknown) => {
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(doc) })
  if (p.status !== 201) throw new Error(`project: ${p.status} ${await p.text()}`)
  return ((await p.json()) as { id: string }).id
}

const prov = spelkortDoc(4)
const provId = await make(prov)

// Den täta leken: fyra varv av provleken med suffix på id, och sju kolumner till som en riktig lek
// bär. Två tal (kostnad, kraft), fyra korta ord och en mening (stämning) — så att mätningen har
// både smala och breda kolumner att dela rummet med.
const SERIE = ['Grundlek', 'Guldrush', 'Ökenvinden', 'Saloonkriget']
const KONST = ['A. Lind', 'Moa Berg', 'J. Öst', 'Sixten Ek', 'Lo Holm']
const SIDA = ['framsida', 'båda']
const STAM = ['Dammet lägger sig över gatan.', 'Någon spelar fel på pianot igen.', 'Sheriffen tittar åt andra hållet.', 'Whiskyn är urvattnad, men billig.', 'Hästarna är oroliga i natt.']
const rows = [] as { id: string; fields: Record<string, unknown> }[]
for (let lap = 0; lap < 4; lap++) {
  prov.rows.forEach((row: { id: string; fields: Record<string, unknown> }, i: number) => {
    const n = lap * prov.rows.length + i
    rows.push({
      id: lap === 0 ? row.id : `${row.id}-${lap + 1}`,
      fields: {
        ...row.fields,
        kostnad: String((n * 7) % 9),
        kraft: String((n * 5) % 12),
        serie: SERIE[lap],
        'konstnär': KONST[n % KONST.length],
        'stämning': STAM[n % STAM.length],
        version: `1.${n % 4}`,
        sida: SIDA[n % 2],
      },
    })
  })
}
const tat = { ...prov, name: "Sal's Saloon, tät", rows }
const tatId = await make(tat)
const links = {
  origin, cookie,
  prov: { id: provId, rows: prov.rows.length, url: `/editor?project=${encodeURIComponent(provId)}` },
  tat: { id: tatId, rows: rows.length, url: `/editor?project=${encodeURIComponent(tatId)}` },
}
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => { await stack.stop(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

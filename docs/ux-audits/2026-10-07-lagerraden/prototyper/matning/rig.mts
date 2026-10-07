// Engångsrigg för prototypen till #699: e2e-stacken (det byggda appen på ett origin, som på lådan)
// och tre spel att öppna Mall-fliken på.
//
// - Sal's Saloon, som det är: sex villkor på «raritet», Koppar och Diamant med 12 kort var.
// - «Långa villkor» (svenska): fem villkor på kolumnen «Utrustningskategori», alla med tre kort,
//   två par som skiljer sig först i början och två som skiljer sig först i slutet, ett villkor
//   «finns» och ett textlager som designern döpt om.
// - «Long conditions» (engelska): samma form på «equipment category».
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
const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'proto699@example.com' }) })
const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
const H = { 'content-type': 'application/json', cookie }

type Doc = ReturnType<typeof spelkortDoc>
const make = async (doc: Doc) => {
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(doc) })
  if (p.status !== 201) throw new Error(`${p.status} ${await p.text()}`)
  return ((await p.json()) as { id: string }).id
}

// A deck whose conditions differ only by value, with long words, built on Sal's Saloon's table so
// that everything but the template and the cards is a game the server already accepts.
function longDoc(name: string, field: string, caption: string, values: string[], titled: string): Doc {
  const doc = spelkortDoc(4)
  const front = doc.template.faces.front!
  const keep = front.base.filter((el) => ['paper', 'band', 'frame', 'title', 'body'].includes(el.id))
  const pills = values.map((value, i) => ({
    kind: 'if' as const,
    id: `if-${i + 1}`,
    when: { field, equals: value },
    children: [{ kind: 'shape' as const, id: `pill-${i + 1}`, x: 5, y: 77, w: 40, h: 6, shape: 'rect' as const, fill: ['#b06a2b', '#c9a25a', '#6a8fb0', '#8b2e2e', '#4f6d2a'][i % 5], radiusMm: 3 }],
  }))
  const filled = { kind: 'if' as const, id: 'if-bildtext', when: { field: caption, nonEmpty: true as const }, children: [{ kind: 'text' as const, id: 'bildtext', x: 5, y: 70, w: 53, h: 5, bind: { field: caption }, font: { family: 'system-ui, sans-serif', sizePt: 8.5 }, color: '#2b2118', fit: 'fixed' as const }] }
  const renamed = { kind: 'text' as const, id: 'text-1', name: titled, x: 5, y: 11.5, w: 40, h: 4, bind: { field }, font: { family: 'system-ui, sans-serif', sizePt: 8.5, weight: 700 }, color: '#fff8e7', fit: 'fixed' as const }
  front.base = [...keep, renamed, filled, ...pills] as never
  front.variants = {}
  const back = doc.template.faces.back!
  back.variants = {}
  doc.rows = values.flatMap((value, i) => [0, 1, 2].map((n) => ({ id: `kort-${i + 1}-${n + 1}`, fields: { title: `${value} ${n + 1}`, typ: 'Playcard', [field]: value, [caption]: n === 0 ? 'x' : '', body: '', antal: 1 } }))) as never
  doc.name = name
  return doc
}

const sal = await make(spelkortDoc(4))
const longSv = await make(longDoc('Långa villkor', 'Utrustningskategori', 'Bildtext', ['Förbannad legendarisk artefakt', 'Välsignad legendarisk artefakt', 'Legendarisk artefakt (förbannad)', 'Legendarisk artefakt (välsignad)', 'Vanlig'], 'Kategorins namn'))
const longEn = await make(longDoc('Long conditions', 'equipment category', 'caption', ['Cursed legendary artifact', 'Blessed legendary artifact', 'Legendary artifact (cursed)', 'Legendary artifact (blessed)', 'Common'], 'Category name'))
const links = { origin, cookie, sal, longSv, longEn }
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => { await stack.stop(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

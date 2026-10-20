// Engångsrigg för prototypen till #1019: e2e-stacken (den byggda appen på ett origin, som på lådan)
// och provleken Sal's Saloon, grupperad efter typ som mallen säger, i två konton.
//
// - «utan»: ett konto utan AI-nyckel, alltså ingenting bredvid väggen (1100, 1280 och 1440).
// - «ai»: ett konto med en nyckel mot stackens falska leverantör, så att AI-panelen står öppen på
//   380 px bredvid väggen, som för en formgivare med en nyckel (#1001).
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
const account = async (email: string) => {
  const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  return (login.headers.get('set-cookie') ?? '').split(';')[0]!
}
const make = async (cookie: string) => {
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(spelkortDoc(4)) })
  if (p.status !== 201) throw new Error(`project: ${p.status} ${await p.text()}`)
  return ((await p.json()) as { id: string }).id
}
const utan = await account('proto1019-utan@example.com')
const ai = await account('proto1019-ai@example.com')
// The fake provider accepts this shape (packages/e2e/test/surfaces/wall-crown-beside.spec.ts).
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefC4C4'
const saved = await fetch(`${origin}/me/ai-key`, { method: 'PUT', headers: { 'content-type': 'application/json', cookie: ai }, body: JSON.stringify({ provider: 'anthropic', key: KEY }) })
if (saved.status !== 200) throw new Error(`ai-key: ${saved.status} ${await saved.text()}`)
const links = {
  origin,
  utan: { cookie: utan, url: `/editor?project=${encodeURIComponent(await make(utan))}` },
  ai: { cookie: ai, url: `/editor?project=${encodeURIComponent(await make(ai))}` },
}
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => { await stack.stop(); process.exit(0) }
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

// Engångsrigg för mätningen till #1073: e2e-stacken (den byggda appen på ett origin, som på lådan)
// och fyra spel — provleken Sal's Saloon, med och utan ett bord igång, för en formgivare utan
// AI-nyckel och en med (då står AI-panelen öppen bredvid arbetet).
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
// Stackens låtsasleverantör tar den här nyckeln (test-support/fake-ai-provider.ts).
const KEY = 'sk-ant-api03-good-e2eNotARealKey-0123456789abcdefQ1q2'

async function account(email: string, ai: boolean) {
  const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) })
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
  const json = { 'content-type': 'application/json', cookie }
  if (ai) {
    const k = await fetch(`${origin}/me/ai-key`, { method: 'PUT', headers: json, body: JSON.stringify({ provider: 'anthropic', key: KEY }) })
    if (k.status !== 200) throw new Error(`ai-key: ${k.status} ${await k.text()}`)
  }
  const make = async (table: boolean) => {
    const p = await fetch(`${origin}/projects`, { method: 'POST', headers: json, body: JSON.stringify(spelkortDoc(4)) })
    if (p.status !== 201) throw new Error(`project: ${p.status} ${await p.text()}`)
    const { id } = (await p.json()) as { id: string }
    if (table) {
      const s = await fetch(`${origin}/projects/${encodeURIComponent(id)}/sessions`, { method: 'POST', headers: { cookie } })
      if (!s.ok) throw new Error(`table: ${s.status} ${await s.text()}`)
    }
    return `/editor?project=${encodeURIComponent(id)}`
  }
  return { cookie, utan: await make(false), bord: await make(true) }
}

const links = { origin, plain: await account('proto1073@example.com', false), ai: await account('proto1073-ai@example.com', true) }
writeFileSync(OUT, JSON.stringify(links, null, 2))
console.log('ready', OUT)
const stop = async () => {
  await stack.stop()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

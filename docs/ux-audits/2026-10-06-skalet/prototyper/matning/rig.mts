// Engångsrigg för prototypen till #749: det BYGGDA appen, en server per variant, och varje
// variants skal injicerat i det byggda index.html — inget annat i bygget är ändrat.
//
//   cd matning && ../../../../../packages/e2e/node_modules/.bin/tsx rig.mts <ut-katalog> nu,a,b,c,d
//
// Varje variant får en egen server (minneslager, AUTH_BYPASS) på 57490 + i, med STATIC_DIR pekat
// på en kopia av bygget där bara index.html skiljer sig. Servern komprimerar det den serverar en
// gång per fil (DRIFT §13), så ett skal byts genom en ny server och inte genom att skriva om filen.
// Varje server får samma bord: Sal's Saloon med fyra platser, Ada på plats A, en observatör och
// kort utdelade, så att varje route landar i sitt riktiga läge när appen tagit över.
import { spawn } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = dirname(fileURLToPath(import.meta.url))
const W = join(HERE, '..', '..', '..', '..', '..')
const { build } = await import(`${W}/packages/e2e/node_modules/vite/dist/node/index.js`)
const { Host } = await import(`${W}/packages/e2e/support/host.ts`)
const { spelkortDoc } = await import(`${W}/packages/server/scripts/spelkort.ts`)

const OUT = process.argv[2] ?? join(HERE, 'ut')
const VARIANTS = (process.argv[3] ?? 'nu').split(',')
const BASE = Number(process.env['BASE_PORT'] ?? 57490)
mkdirSync(OUT, { recursive: true })

// Ett bygge, som stacken gör det (packages/e2e/support/stack.ts).
const NU = join(OUT, 'dist-nu')
rmSync(NU, { recursive: true, force: true })
await build({ root: join(W, 'packages', 'web'), logLevel: 'silent', build: { outDir: NU, emptyOutDir: true } })
const html = readFileSync(join(NU, 'index.html'), 'utf8')
writeFileSync(join(OUT, 'index-nu.html'), html)

// Ett skal är en fil i skal/ med två delar: det som står sist i <head> före bygget egna
// <script>/<link>, och det som står i #root. React tömmer #root vid första ritningen, så skalet
// försvinner i samma ram som appens första ram — det är hela övertagandet.
function inject(v: string): string {
  if (v === 'nu') return html
  // «b0» är b:s skal med arket kvar i <head>, där det blockerar varje målning som i dag.
  const blocking = v.endsWith('0')
  const src = readFileSync(join(HERE, 'skal', `${v.replace(/0$/, '')}.html`), 'utf8')
  const [, head = '', body = ''] = src.match(/<!--head-->([\s\S]*?)<!--body-->([\s\S]*)$/) ?? []
  const at = html.indexOf('<script>')
  if (at < 0) throw new Error('det byggda index.html har ingen förladdning att ställa skalet före')
  let out = `${html.slice(0, at)}${head.trim()}\n    ${html.slice(at)}`
  out = out.replace('<div id="root"></div>', `<div id="root">${body.trim()}</div>`)
  if (blocking) return out
  // Arket flyttas från <head> till efter #root. Ett ark i <head> blockerar all målning tills det
  // är nere — 105 kB brotli med filtens ansikte i, sekunder på ett långsamt nät — medan ett ark i
  // <body> bara blockerar det som står efter det. Skalet står före och målas direkt. Entrén är ett
  // modulskript och väntar ändå in arket innan det körs (ett ark som blockerar skript), så appens
  // första ram ritas fortfarande med arket på plats: filtens ansikte före första pixeln (K20, L20).
  const css = out.match(/\s*<link rel="stylesheet" crossorigin href="[^"]+">/)
  if (!css) throw new Error('hittar inte det blockerande arket')
  out = out.replace(css[0], '')
  return out.replace('</body>', `  ${css[0].trim()}\n  </body>`)
}

const servers: { kill: () => void }[] = []
const links: Record<string, unknown> = {}
for (const [i, v] of VARIANTS.entries()) {
  const dir = join(OUT, `dist-${v}`)
  if (v !== 'nu') {
    rmSync(dir, { recursive: true, force: true })
    cpSync(NU, dir, { recursive: true })
    writeFileSync(join(dir, 'index.html'), inject(v))
    writeFileSync(join(OUT, `index-${v}.html`), inject(v))
  }
  const port = BASE + i
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(process.execPath, ['--import', 'tsx', join(W, 'packages', 'server', 'src', 'main.ts')], {
    cwd: join(W, 'packages', 'e2e'),
    env: { ...process.env, DATABASE_URL: '', STATIC_DIR: dir, PORT: String(port), PUBLIC_ORIGIN: origin, AUTH_BYPASS: 'true', IDLE_EVICT_MS: String(24 * 3600_000), IDLE_END_MS: String(24 * 3600_000) },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  servers.push(child)
  for (let k = 0; ; k++) {
    try {
      if ((await fetch(`${origin}/health`)).ok) break
    } catch {}
    if (k > 300) throw new Error(`servern för ${v} kom aldrig upp`)
    await new Promise((r) => setTimeout(r, 100))
  }
  links[v] = await fixture(origin)
  console.log('uppe', v, origin)
}
writeFileSync(join(OUT, 'links.json'), JSON.stringify(links, null, 2))
writeFileSync(join(HERE, 'links.json'), JSON.stringify(links, null, 2))
console.log('klar', join(OUT, 'links.json'))

async function fixture(origin: string) {
  const login = await fetch(`${origin}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `proto749-${Date.now()}@example.com` }) })
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!
  const H = { 'content-type': 'application/json', cookie }
  const doc = spelkortDoc(4)
  const p = await fetch(`${origin}/projects`, { method: 'POST', headers: H, body: JSON.stringify(doc) })
  const { id: project } = (await p.json()) as { id: string }
  const s = await fetch(`${origin}/projects/${project}/sessions`, { method: 'POST', headers: H })
  const { id: session, code, hostKey } = (await s.json()) as { id: string; code: string; hostKey: string }
  const seats = doc.setup.seats as string[]
  const joinAs = async (body: object) => {
    const j = await fetch(`${origin}/rooms/${code}/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return ((await j.json()) as { token: string }).token
  }
  const ada = await joinAs({ name: 'Ada', seat: 'A' })
  const obs = await joinAs({ name: 'Olle' })
  const host = await Host.open(origin, { session, hostKey } as never)
  await host.send([{ v: 'shuffle', pile: 'draw' }])
  await host.send([{ v: 'deal', from: 'draw', to: seats.map((x) => `hand:${x}`), each: 5 }])
  await host.send([{ v: 'draw', from: 'draw', to: 'market', count: 3, face: 'front' }])
  await host.send([{ v: 'draw', from: 'draw', to: 'discard', count: 2, face: 'front' }])
  host.close()
  const hk = encodeURIComponent(hostKey)
  const q = (o: Record<string, string>) => new URLSearchParams(o).toString()
  return {
    origin, cookie, project, session, code,
    urls: {
      start: '/',
      login: '/login',
      editor: `/editor?project=${project}`,
      tv: `/table?session=${session}&host=${hk}&mode=tv&lang=sv`,
      bord: `/table?session=${session}&host=${hk}&mode=table&lang=sv`,
      join: `/join?code=${code}`,
      play: `/play?${q({ session, name: 'Ada', token: ada, seat: 'A' })}`,
      observe: `/observe?${q({ session, name: 'Olle', token: obs })}`,
    },
  }
}

const stop = () => {
  for (const s of servers) s.kill()
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
setInterval(() => undefined, 1 << 30)

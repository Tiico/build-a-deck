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
  const src = readFileSync(join(HERE, 'skal', `${v}.html`), 'utf8')
  const [, head = '', body = ''] = src.match(/<!--head-->([\s\S]*?)<!--body-->([\s\S]*)$/) ?? []
  const at = html.indexOf('<script>')
  if (at < 0) throw new Error('det byggda index.html har ingen förladdning att ställa skalet före')
  let out = `${html.slice(0, at)}${head.trim()}\n    ${html.slice(at)}`
  // Variant med ark som inte blockerar: arket hämtas som förut men väntas in av ett skript
  // i stället för av målningen. Entrén hämtas direkt (modulepreload) och körs när arket är på plats,
  // så att filten aldrig ritas utan sitt ansikte (K20, L20).
  if (src.includes('data-ark="fritt"')) {
    const css = out.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/)
    const js = out.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/)
    if (!css || !js) throw new Error('hittar inte arket eller entrén')
    out = out.replace(css[0], `<link rel="preload" as="style" crossorigin href="${css[1]}"><link rel="stylesheet" crossorigin href="${css[1]}" media="print" onload="this.media='all';window.__bydArk&&window.__bydArk()">`)
    out = out.replace(js[0], `<link rel="modulepreload" crossorigin href="${js[1]}"><script>(function(){var go=function(){var s=document.createElement('script');s.type='module';s.crossOrigin='';s.src=${JSON.stringify(js[1])};document.head.appendChild(s)};var l=document.querySelector('link[media=print][rel=stylesheet]');if(!l||l.sheet&&l.media==='all')go();else window.__bydArk=go})()</script>`)
  }
  return out.replace('<div id="root"></div>', `<div id="root">${body.trim()}</div>`)
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

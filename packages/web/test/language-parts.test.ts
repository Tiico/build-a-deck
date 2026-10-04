import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { svAccount } from '../src/i18n/sv.account.js'
import { svEditor } from '../src/i18n/sv.editor.js'
import { svPlay } from '../src/i18n/sv.play.js'
import { svStatus } from '../src/i18n/sv.status.js'
import { enAccount } from '../src/i18n/en.account.js'
import { enEditor } from '../src/i18n/en.editor.js'
import { enPlay } from '../src/i18n/en.play.js'
import { enStatus } from '../src/i18n/en.status.js'
import { PARTS, type Part } from '../src/i18n/index.js'

// Every surface fetches the parts of the catalogue it speaks, and only those (#760). A word a
// surface reaches but its parts do not hold is drawn as its key — and nothing in a test that
// mounts the surface on its own would notice, because a test holds the whole catalogue. So the
// promise is read off the code instead: the keys each route's modules name, against the parts
// `fetchPage` in `App.tsx` gives that route.
//
// What a module "names" is any string that is a key, a template that starts like a key
// (`rules.${kind}` names every `rules.` key), or a prefix glued on with `+`. That reads more than
// is drawn — a module is one unit however few of its functions a surface calls — and a route that
// reads more than it needs is told so here and fixed by splitting the module, which is what
// `account/session.ts` is. `phone-bundle.spec.ts` is the other half: every address opened in a
// browser, in both languages, with an eye on the console.
const SRC = join(import.meta.dirname, '..', 'src')

const SV: Record<Part, Record<string, string>> = { status: svStatus, play: svPlay, account: svAccount, editor: svEditor }
const EN: Record<Part, Record<string, string>> = { status: enStatus, play: enPlay, account: enAccount, editor: enEditor }

const partOf = new Map<string, Part>()
for (const part of PARTS) for (const key of Object.keys(SV[part])) partOf.set(key, part)
const keys = [...partOf.keys()]

const resolveSpec = (from: string, spec: string): string | null => {
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  const tries = [base.replace(/\.js$/, '.tsx'), base.replace(/\.js$/, '.ts'), base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]
  return tries.find((p) => existsSync(p) && statSync(p).isFile()) ?? null
}
const source = (file: string) => readFileSync(file, 'utf8')
// Every edge, the plain and the fetched: a panel behind `lazy()` is still drawn by its surface.
// Type-only imports carry no words and are left out.
const edges = (file: string): string[] =>
  file.endsWith('.css')
    ? []
    : [...source(file).matchAll(/(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^;'"]*?\bfrom\s*)?['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)]
        .map((m) => resolveSpec(file, (m[1] ?? m[2])!))
        .filter((p): p is string => p !== null)

const named = (file: string): Set<string> => {
  const text = source(file)
  const out = new Set<string>()
  for (const m of text.matchAll(/['"`]([a-zA-Z][\w.-]*)['"`]/g)) if (partOf.has(m[1]!)) out.add(m[1]!)
  const prefixes = [...text.matchAll(/`([a-zA-Z][\w.-]*\.)\$\{/g), ...text.matchAll(/['"]([a-zA-Z][\w.-]*\.)['"]\s*\+/g)].map((m) => m[1]!)
  for (const prefix of prefixes) for (const key of keys) if (key.startsWith(prefix)) out.add(key)
  return out
}

// The routes as `fetchPage` says them: the address, the module that draws it, and its parts.
const APP = join(SRC, 'App.tsx')
const app = source(APP)
const routes = [...app.matchAll(/path(?:\.startsWith\(|\s*===\s*)'([^']+)'\)?\)\s*return\s+surface\((?:import\('([^']+)'\)[^,]*|Promise\.resolve\((\w+)\)),\s*\[([^\]]*)\]\)/g)].map((m) => {
  const imported = m[3] && new RegExp(`import\\s*\\{[^}]*\\b${m[3]}\\b[^}]*\\}\\s*from\\s*'([^']+)'`).exec(app)
  return {
    path: m[1]!,
    // A page `App.tsx` draws itself — the editor's wrapper — is drawn from `App.tsx`.
    module: m[2] ? resolveSpec(APP, m[2]) : imported ? resolveSpec(APP, imported[1]!) : APP,
    parts: ['status', ...[...m[4]!.matchAll(/'([a-z]+)'/g)].map((p) => p[1]!)] as Part[],
  }
})
const routeModules = new Set(routes.map((r) => r.module))
const EDITOR = join(SRC, 'editor', 'EditorPage.tsx')

// What a start reaches without walking into another route: every surface is checked as itself.
const reached = (start: string, alsoStopAt: string[] = []): Set<string> => {
  const stop = new Set([...routeModules, ...alsoStopAt])
  const seen = new Set<string>()
  const walk = (file: string): void => {
    if (seen.has(file) || file.startsWith(join(SRC, 'i18n'))) return
    seen.add(file)
    for (const next of edges(file)) if (!stop.has(next) || next === start) walk(next)
  }
  walk(start)
  return seen
}
const wordsOf = (files: Set<string>): Set<string> => new Set([...files].flatMap((f) => [...named(f)]))

// The shell: what every route is drawn inside, and so what every route must be able to say.
const shell = wordsOf(reached(APP, [EDITOR]))

describe('every surface fetches the words it draws (#760)', () => {
  it('reads the routes and their parts off App.tsx, and finds real ones', () => {
    expect(routes.length).toBeGreaterThanOrEqual(11)
    expect(routes.filter((r) => r.module === null)).toEqual([])
    expect(routes.find((r) => r.path === '/play')?.parts).toEqual(['status', 'play'])
    expect(routes.find((r) => r.path === '/join')?.parts).toEqual(['status', 'play'])
  })

  it('lets the shell say only what every route fetches', () => {
    expect(shell.size).toBeGreaterThan(50)
    expect([...shell].filter((key) => partOf.get(key) !== 'status').map((key) => `${key} (${partOf.get(key)})`)).toEqual([])
  })

  it.each(routes.map((r) => [r.path, r] as const))('lets %s say only what it fetches', (_, route) => {
    const words = new Set([...shell, ...wordsOf(reached(route.module!))])
    const beyond = [...words].filter((key) => !route.parts.includes(partOf.get(key)!))
    expect(beyond.map((key) => `${key} is in ${partOf.get(key)}, which ${route.path} does not fetch (${relative(SRC, route.module!)})`)).toEqual([])
  })

  it('keeps the phone to the shell and its own words', () => {
    const phone = wordsOf(reached(routes.find((r) => r.path === '/play')!.module!))
    expect(phone.size).toBeGreaterThan(200)
  })
})

describe('both languages hold the same keys part by part (#760)', () => {
  // The whole catalogue's promise (`i18n.test.tsx`) is not enough once the parts travel apart: a
  // key written in Swedish in one part and in English in another passes it, and is missing from
  // whichever page fetched the English part it is not in.
  it.each(PARTS.map((part) => [part]))('holds the same keys in sv.%s and en.%s', (part) => {
    expect(Object.keys(EN[part]).sort()).toEqual(Object.keys(SV[part]).sort())
  })
})

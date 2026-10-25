import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Vad telefonens första bild drar in, läst ur importerna (#1304).
//
// `phone-bundle.spec.ts` väger det telefonen hämtar, men en vikt säger inte vem som tog platsen.
// Det som fyllde bunten till några byte under taket var inte telefonens egna ytor: två konstanter
// i filtens mått (`CHIP_MM`, `DIE_MM`), punkten i millimeter (`PT_TO_MM`) och en enhetsomräkning
// för regelbokens bilder (`ruleEm`) hämtades ur paketens samlingsfiler, och en samlingsfil drar med sig varje modul den nämner som
// har en sida-effekt på toppnivå. Ett zod-schema är ett anrop, så Rollup behåller det: projektets
// dokument, regelbokens tolk och markdown-läsaren åkte med till en telefon som aldrig läser dem,
// tio kilobyte gzip.
//
// Så frågan ställs här som en medlemsfråga och inte som ett tal: vilka moduler i serverns och
// mallens paket når telefonens första bild genom statiska importer? Ett `import()` är en egen chunk
// som hämtas när den behövs och räknas inte; en import av bara typer försvinner i bygget och räknas
// inte heller. Allt annat räknas, även det en samlingsfil bara nämner, eftersom det är så Rollup
// räknar när modulen har sida-effekter.
const ROOT = join(import.meta.dirname, '..', '..')
const SRC = join(ROOT, 'web', 'src')

// Ett arbetsytepakets namn och undersökväg, som paketets `exports` säger dem.
const workspace = (spec: string): string | null => {
  const m = /^@byd\/([a-z]+)(\/.*)?$/.exec(spec)
  if (!m) return null
  const dir = join(ROOT, m[1]!)
  const exports = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { exports: Record<string, string> }).exports
  const target = exports[`.${m[2] ?? ''}`]
  if (!target) throw new Error(`${spec} är inte en väg som @byd/${m[1]} exporterar`)
  return join(dir, target)
}

const resolveSpec = (from: string, spec: string): string | null => {
  if (spec.startsWith('@byd/')) return workspace(spec)
  if (!spec.startsWith('.')) return null
  const base = resolve(dirname(from), spec)
  const tries = [base.replace(/\.js$/, '.tsx'), base.replace(/\.js$/, '.ts'), base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]
  return tries.find((p) => existsSync(p) && statSync(p).isFile()) ?? null
}

// De statiska kanterna: `import … from`, `export … from` och en import för sidans skull. En import
// vars alla namn är typer (`import type`, eller `{ type A, type B }`) bär ingen kod.
const STATIC = /(?:^|\n)\s*(import|export)\s+(type\s+)?([^;'"]*?)\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g
const onlyTypes = (names: string): boolean => {
  const inside = /^\{([\s\S]*)\}$/.exec(names.trim())
  if (!inside) return false
  const each = inside[1]!.split(',').map((n) => n.trim()).filter(Boolean)
  return each.length > 0 && each.every((n) => n.startsWith('type '))
}
const edges = (file: string): string[] => {
  if (!/\.tsx?$/.test(file)) return []
  const out: string[] = []
  for (const m of readFileSync(file, 'utf8').matchAll(STATIC)) {
    const spec = m[4] ?? m[5]!
    if (m[2] || (m[3] && onlyTypes(m[3]))) continue
    const next = resolveSpec(file, spec)
    if (next) out.push(next)
  }
  return out
}

const reached = (...starts: string[]): Set<string> => {
  const seen = new Set<string>()
  const walk = (file: string): void => {
    if (seen.has(file)) return
    seen.add(file)
    for (const next of edges(file)) walk(next)
  }
  for (const start of starts) walk(start)
  return seen
}

// Telefonens ytor: handen på `/play`, platsväljaren på `/join` och på rummets egen adress, och
// ingången som alla tre står i.
const PHONE = [join(SRC, 'main.tsx'), join(SRC, 'player', 'PlayerPage.tsx'), join(SRC, 'join', 'JoinPage.tsx')]

// Det enda telefonen får ur serverns och mallens paket: moduler utan något annat än tal och små
// rena funktioner, som filtens mått och typografins enheter.
const ALLOWED = new Set([join(ROOT, 'server', 'src', 'felt-sizes.ts'), join(ROOT, 'template', 'src', 'units.ts')])

describe('telefonens första bild drar inte in projektets dokument eller regelbokens tolk (#1304)', () => {
  const phone = reached(...PHONE)

  it('läser verkligen telefonens importer', () => {
    // Inte tomt: vägen går genom handen, filten den lånar mått av och protokollet.
    expect(phone.has(join(SRC, 'player', 'PlayerSurface.tsx'))).toBe(true)
    expect(phone.has(join(SRC, 'table', 'drop.ts'))).toBe(true)
    expect(phone.has(join(ROOT, 'protocol', 'src', 'index.ts'))).toBe(true)
  })

  it('når inget i serverns eller mallens paket utöver det rena', () => {
    const heavy = [...phone].filter((f) => /[/\\](?:server|template)[/\\]src[/\\]/.test(f) && !ALLOWED.has(f))
    expect(heavy.map((f) => relative(ROOT, f)).sort()).toEqual([])
  })
})

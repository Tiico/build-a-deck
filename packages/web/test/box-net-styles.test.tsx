// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { TUCKBOX, tuckNet } from '@byd/engine'
import { NetLines } from '../src/editor/box-net.js'

// Lådans nät har en enda källa för sina stilar (#1434). Fliken Låda och tryckpaketet ritar samma nät
// (#1418), och i #1433 fick tryckpaketet en kopia av editorns regler under `.byd-print-box`, eftersom
// ett delat ark hade blivit ett andra ark som `/editor` hämtar (felt-font.spec, #186). Två kopior
// glider isär. Reglerna följer nu med nätets egen modul, som `BOX_SCENE_CSS` följer med «Visa upp».
//
// Det som läses här är källträdet: varje stilmall och varje modul som bär CSS i en sträng. En regel
// för nätet är en väljare vars ämne är en av nätets klasser, med det som står framför (en sidas eget
// scope, som `.byd-print-box`) bortskalat, så att en kopia under ett annat scope räknas som en kopia.
const SRC = join(import.meta.dirname, '..', 'src')
const filesUnder = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)]))
const at = (path: string) => relative(SRC, path).split(sep).join('/')
const sources = filesUnder(SRC).filter((f) => /\.(css|tsx?)$/.test(f))

// Nätets egna klasser: det `NetLines` ritar, arket de ligger på och ytorna på arket.
const DRAWN = ['lines', 'flap', 'flap-glue', 'glue-ground', 'glue', 'cut', 'fold']
const NET = new RegExp(`^\\.byd-box-(?:${[...DRAWN, 'net', 'panel'].join('|')})(?![\\w-])`)

type Declared = { file: string; selector: string; property: string }
function declarations(file: string): Declared[] {
  const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Declared[] = []
  for (const [, head, body] of text.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    // I en modul står regeln i en sträng: väljaren börjar efter strängens citattecken.
    const selectors = head!.slice(Math.max(head!.lastIndexOf("'"), head!.lastIndexOf('"'), head!.lastIndexOf('`')) + 1)
    for (const raw of selectors.split(',')) {
      const steps = raw.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/)
      const from = steps.findIndex((s) => s.startsWith('.byd-box-'))
      if (from < 0) continue
      const selector = steps.slice(from).join(' ')
      if (!NET.test(selector)) continue
      for (const decl of body!.split(';')) {
        const property = decl.split(':')[0]!.trim()
        if (/^[a-z-]+$/.test(property)) out.push({ file: at(file), selector, property })
      }
    }
  }
  return out
}
const all = sources.flatMap(declarations)

afterEach(cleanup)

describe('lådans näts stilar (#1434)', () => {
  it('läser verkligen nätets regler, så att kontrollen inte är tom', () => {
    for (const drawn of DRAWN) expect(all.some((d) => d.selector === `.byd-box-${drawn}`), drawn).toBe(true)
    expect(all.some((d) => d.selector === '.byd-box-panel[data-turned] > .byd-preview' && d.property === 'transform')).toBe(true)
  })

  it('definierar varje regel för nätet på ett enda ställe', () => {
    const places = new Map<string, Set<string>>()
    for (const d of all) {
      const key = `${d.selector} { ${d.property} }`
      places.set(key, (places.get(key) ?? new Set()).add(d.file))
    }
    const twice = [...places].filter(([, files]) => files.size > 1).map(([key, files]) => `${key} i ${[...files].join(' och ')}`)
    expect(twice).toEqual([])
  })

  it('har det nätet ritar i nätets egen modul och ingen annanstans', () => {
    const elsewhere = all.filter((d) => DRAWN.some((c) => d.selector.startsWith(`.byd-box-${c}`)) && d.file !== 'editor/box-net.tsx')
    expect(elsewhere.map((d) => `${d.file}: ${d.selector} { ${d.property} }`)).toEqual([])
  })

  it('bär sina regler in i sidan där det ritas, utan ett eget ark att hämta', () => {
    const net = tuckNet(TUCKBOX, { width: 65, height: 90, depth: 20 })
    render(
      <div className="byd-box-net">
        <NetLines net={net} px={2} part="flaps" />
        <NetLines net={net} px={2} part="lines" />
      </div>,
    )
    const styles = [...document.querySelectorAll('style')].filter((s) => s.textContent?.includes('.byd-box-fold'))
    // En gång per nät, inte en gång per lager av linjer.
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toContain('stroke-dasharray')
  })
})

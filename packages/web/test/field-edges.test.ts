import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssCustomProperties, cssDeclaredUnder } from '../src/player/contrast.js'

// A field's edge is the one thing that says where the field is (#553, beställarens beslut
// 2026-09-30, A for the fields). The edges were greys of their own, 1.2–1.5:1 against the ground,
// under WCAG's 3:1 for what is not text (1.4.11). They take the line the button language already
// measured to 3:1 for an outlined button (L13), `--byd-secondary-line`, on every surface, so a field
// and a button have one edge between them.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const language = read('src/buttons.css')
const SURFACES = [
  { what: 'the account', file: 'src/account/account.css', scope: '.byd-account', grounds: ['#14161c', '#1b1e27'] },
  { what: 'the seat picker', file: 'src/join/join.css', scope: '.byd-join', grounds: ['#14161c', '#1b1e27'] },
  { what: 'the guided start', file: 'src/wizard/wizard.css', scope: '.byd-wizard', grounds: ['#eeece4', '#ffffff'] },
  { what: 'the editor', file: 'src/editor/editor.css', scope: '.byd-editor', grounds: ['#23262e', '#1b1d23', '#171a23', '#14161c', '#0f1115'] },
] as const

// Every rule that draws a field — an input, a select, a textarea or a search — with a solid edge.
const fieldEdges = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .map(([, selector, body]) => ({ selector: selector!.trim(), edge: /(?:^|;)\s*border:\s*1px solid ([^;]+)/.exec(body!)?.[1]?.trim() }))
    .filter((rule) => rule.edge !== undefined && /\b(input|select|textarea)\b|search/.test(rule.selector) && !/checkbox|radio|type='file'|type="file"|range|color/.test(rule.selector.replace(/:not\([^)]*\)/g, '')))

describe.each(SURFACES)('the fields in $what (#553)', ({ file, scope, grounds }) => {
  const css = read(file)

  it('draws every field’s edge in the button language’s line', () => {
    const edges = fieldEdges(css)
    expect(edges.length).toBeGreaterThan(0)
    expect(edges.filter((rule) => rule.edge !== 'var(--byd-secondary-line)').map((rule) => `${rule.selector}: ${rule.edge}`)).toEqual([])
  })

  it('has that line at 3:1 against every ground a field stands on there', () => {
    const line = cssCustomProperties(cssDeclaredUnder(language, scope)).get('--byd-secondary-line')!
    expect(line).toMatch(/^#/)
    for (const ground of grounds) expect({ ground, clears: contrastRatio(line, ground) >= 3 }).toEqual({ ground, clears: true })
  })
})

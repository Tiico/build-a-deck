// What the stylesheet says about the help pattern (L32, #303), read out of its text.
//
// Three things the decision holds that no rendered test can see: that no rule opens the box on
// hover — the way in is click and focus, nothing else — that nothing in it moves, so there is no
// transition for reduced motion to have to cut, and that the question mark is a target the size
// the editor gives every control, however small the ring it draws.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Without its comments: a comment that says «ingen :hover öppnar den» is not a rule that does.
const css = readFileSync(join(import.meta.dirname, '..', 'src/editor/editor.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
// Every rule whose selector names the pattern, as `[selector, declarations]`.
const rules = [...css.matchAll(/([^{}]*byd-help[^{}]*)\{([^}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!.trim()] as const)

describe('the help pattern in the stylesheet', () => {
  it('draws the pattern at all', () => {
    expect(rules.some(([selector]) => selector.includes('.byd-help-box'))).toBe(true)
    expect(rules.some(([selector]) => selector.includes('.byd-help-ask'))).toBe(true)
  })

  it('never opens or shows the box on hover', () => {
    const hovering = rules.filter(([selector]) => selector.includes(':hover'))
    expect(hovering.filter(([selector]) => selector.includes('byd-help-box'))).toEqual([])
    expect(hovering.filter(([, body]) => /display|visibility|opacity/.test(body))).toEqual([])
  })

  it('moves nothing, so there is no motion for reduced motion to cut', () => {
    expect(rules.filter(([, body]) => /transition|animation/.test(body))).toEqual([])
  })

  it('gives the question mark the hit area the editor gives every control', () => {
    const ask = rules.find(([selector]) => selector === '.byd-help-ask')
    expect(ask).toBeDefined()
    expect(ask![1]).toMatch(/width: var\(--byd-tap\)/)
    expect(ask![1]).toMatch(/height: var\(--byd-tap\)/)
  })

  it('lays the box over the work, fixed to the window and never inside a column that clips', () => {
    const box = rules.find(([selector]) => selector === '.byd-help-box')
    expect(box![1]).toMatch(/position: fixed/)
  })
})

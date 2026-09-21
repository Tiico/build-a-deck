// What the stylesheet says about the help pattern (L32, #303), read out of its text.
//
// Three things the decision holds that no rendered test can see: that no rule opens the box on
// hover — the way in is click and focus, nothing else — that nothing in it moves, so there is no
// transition for reduced motion to have to cut, and that the question mark is a target the size
// every control has, however small the ring it draws.
//
// The rules are the pattern's own sheet since #304: the start, the account and the guided start
// use the same question mark, and none of them loads the editor's sheet.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Without its comments: a comment that says «ingen :hover öppnar den» is not a rule that does.
const css = readFileSync(join(import.meta.dirname, '..', 'src/help.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
// Every rule whose selector names the pattern, as `[selector, declarations]`.
const rules = [...css.matchAll(/([^{}]*byd-help[^{}]*)\{([^}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!.trim()] as const)

describe('the help pattern in the stylesheet', () => {
  it('draws the pattern at all', () => {
    expect(rules.some(([selector]) => selector.includes('.byd-help-box'))).toBe(true)
    expect(rules.some(([selector]) => selector.includes('.byd-help-ask'))).toBe(true)
  })

  // The topic is written for the sentence «Hjälp om lagerlistan», so it comes in lower case; as
  // the box's own heading it stands alone, and a heading in lower case reads as a slip.
  it('capitalises the topic where it stands as the box’s heading', () => {
    expect(css).toMatch(/\.byd-help-topic::first-letter\s*\{[^}]*text-transform:\s*uppercase/)
  })

  it('never opens or shows the box on hover', () => {
    const hovering = rules.filter(([selector]) => selector.includes(':hover'))
    expect(hovering.filter(([selector]) => selector.includes('byd-help-box'))).toEqual([])
    expect(hovering.filter(([, body]) => /display|visibility|opacity/.test(body))).toEqual([])
  })

  it('moves nothing, so there is no motion for reduced motion to cut', () => {
    expect(rules.filter(([, body]) => /transition|animation/.test(body))).toEqual([])
  })

  it('gives the question mark the hit area every control has, on every surface it stands on', () => {
    const ask = rules.find(([selector]) => selector === '.byd-help .byd-help-ask')
    expect(ask).toBeDefined()
    expect(ask![1]).toMatch(/width: var\(--byd-tap, 44px\)/)
    expect(ask![1]).toMatch(/height: var\(--byd-tap, 44px\)/)
  })

  // The felt's own «?» in the corner (#224) was `.byd-help` too, and both sheets block the first
  // painting: the corner's rule would have pinned the account's question mark to the card's
  // corner. Two things, two names.
  it('shares no name with the felt’s shortcut help', () => {
    const felt = readFileSync(join(import.meta.dirname, '..', 'src/table/table.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const mine = new Set(rules.flatMap(([selector]) => [...selector.matchAll(/\.(byd-help[a-z-]*)/g)].map((m) => m[1]!)))
    const theirs = [...felt.matchAll(/\.(byd-help[a-z-]*)/g)].map((m) => m[1]!)
    expect(theirs.filter((name) => mine.has(name))).toEqual([])
  })

  it('lays the box over the work, fixed to the window and never inside a column that clips', () => {
    const box = rules.find(([selector]) => selector === '.byd-help-box')
    expect(box![1]).toMatch(/position: fixed/)
  })
})

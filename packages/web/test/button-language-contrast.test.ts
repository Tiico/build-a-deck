import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio, cssCustomProperties, cssDeclaredUnder } from '../src/player/contrast.js'

// The three roles, measured on every ground each of them actually lands on (#44).
//
// The outlined secondary is the one that had to be invented. Nothing in the tool was outlined
// before: what looked like an outlined button in the editor was `#3b414e` on `#23262e`, and in the
// wizard `#cbcabe` on `#f5f3eb` — 1.48:1 both, which is to say invisible to the standard. A line
// is a graphic and carries 3:1 (L11), so the line a secondary is drawn with is a colour of its own
// and is held to that bar here rather than chosen by eye.
//
// The bar under what is chosen is a graphic too, and it is the thinnest thing in the language —
// three pixels — so it is the one that most needs measuring against the surface it lands on.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const language = read('src/buttons.css')
const tokensOf = (rel: string, root: string) => {
  const tokens = cssCustomProperties(`${read(rel)}\n${cssDeclaredUnder(language, root)}`)
  return (name: string) => {
    const value = tokens.get(name)
    if (value === undefined) throw new Error(`${rel} and ${root} in buttons.css between them declare no ${name}`)
    return value
  }
}

// Each surface, its root, the stylesheet it binds the roles in, and the grounds a role is read on
// there. A ground is a token wherever the surface has one; where the surface had none — the
// account and the seat picker declared no tokens at all before this — it now does.
const SURFACES = [
  { what: 'the account', root: '.byd-account', css: 'src/account/account.css', grounds: ['--byd-account-bg', '--byd-account-card-bg', '--byd-account-field-bg'] },
  { what: 'the seat picker', root: '.byd-join', css: 'src/join/join.css', grounds: ['--byd-join-bg'] },
  { what: 'the wizard', root: '.byd-wizard', css: 'src/wizard/wizard.css', grounds: ['--paper', '--byd-wizard-panel-bg', '--byd-wizard-field-bg'] },
  { what: 'the editor', root: '.byd-editor', css: 'src/editor/editor.css', grounds: ['--byd-editor-chrome-bg', '--byd-editor-stage-bg', '--byd-editor-table-panel-bg'] },
  { what: 'the phone', root: '.byd-player', css: 'src/player/player.css', grounds: ['--byd-bg', '--byd-surface', '--byd-control'] },
] as const

describe.each(SURFACES)('the button language on $what', ({ css, root, grounds }) => {
  const token = tokensOf(css, root)

  it('carries the label on its first action at AA', () => {
    expect(contrastRatio(token('--byd-primary-ink'), token('--byd-primary-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(grounds)('lets the line round a second action be seen on %s', (ground) => {
    expect(contrastRatio(token('--byd-secondary-line'), token(ground))).toBeGreaterThanOrEqual(3)
  })

  it.each(grounds)('carries the label of a second action on %s at AA', (ground) => {
    expect(contrastRatio(token('--byd-secondary-ink'), token(ground))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(grounds)('lets the bar under what is chosen be seen on %s', (ground) => {
    expect(contrastRatio(token('--byd-chosen-bar'), token(ground))).toBeGreaterThanOrEqual(3)
  })

  it.each(grounds)('carries the word of what is chosen on %s at AA', (ground) => {
    expect(contrastRatio(token('--byd-chosen-ink'), token(ground))).toBeGreaterThanOrEqual(4.5)
  })
})

// The second control case, and the decision itself said as a number. Variant B moves no hue: the
// felt stays green, the wizard stays paper and the editor stays blue, so the same token name has
// to come back as three different colours depending on which surface is asking. If it ever came
// back as one colour everywhere, every measurement above would be measuring the same pair five
// times over and saying nothing about four of the surfaces.
describe('one name for the first action, and not one colour', () => {
  it('hands each surface the accent that surface already owned', () => {
    const fills = SURFACES.map(({ what, css, root }) => [what, tokensOf(css, root)('--byd-primary-bg')] as const)
    expect(Object.fromEntries(fills)).toEqual({
      'the account': '#7dd3a0',
      'the seat picker': '#7dd3a0',
      'the wizard': '#1e2620',
      'the editor': '#1f6fd0',
      'the phone': '#7dd3a0',
    })
  })
})

// The control case for all of the above: the two lines that pass for an outline today, measured.
// If the helper this suite leans on ever stopped reading a colour properly, these would stop
// failing the bar — and a suite in which nothing can fail is a suite that says nothing.
describe('what passed for an outline before there was a token for it', () => {
  it.each([
    { what: "the editor's own button edge", line: '#3b414e', on: '#23262e' },
    { what: "the wizard's own button edge", line: '#cbcabe', on: '#f5f3eb' },
  ])('leaves $what invisible to the standard', ({ line, on }) => {
    expect(contrastRatio(line, on)).toBeLessThan(3)
  })
})

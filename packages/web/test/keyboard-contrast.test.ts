import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { cardFaceRamp, contrastRatio, cssCustomProperties } from '../src/player/contrast.js'

// The focus ring is the whole of what a keyboard user can see about where she is, so it is held
// to the graphics bar (3:1) against every ground it is ever drawn on — and the panel's own text
// to the text bar. Before #1 and #2 there was no ring anywhere on these three routes to measure.
const read = (rel: string) => readFileSync(join(import.meta.dirname, '..', rel), 'utf8')
const tokens = cssCustomProperties(read('src/table/keyboard.css'))
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`keyboard.css declares no ${name}`)
  return value
}

// Every ground a ring can land on: the felt in table mode, the TV's dark table, the wood around
// it, the panel and its rows, the phone's ground, and the lightest and darkest card face.
const faces = cardFaceRamp('40%', '86%')
const GROUNDS: Record<string, string> = {
  felt: '#2e6b46',
  'felt edge': '#173a26',
  'tv table': '#151924',
  wood: '#5a3b22',
  'wood dark': '#3a2414',
  'phone ground': '#14161c',
  panel: token('--byd-kbd-bg'),
  'panel row': token('--byd-kbd-control'),
  'panel row off': token('--byd-kbd-off'),
  'lightest card face': faces.reduce((a, b) => (contrastRatio(a, '#fff') < contrastRatio(b, '#fff') ? a : b)),
  'darkest card face': faces.reduce((a, b) => (contrastRatio(a, '#000') < contrastRatio(b, '#000') ? a : b)),
}

// The ring is drawn as two bands against each other, so what has to hold is that the pair reads
// against itself and that at least one of the two reads against whatever is behind it.
const seen = (a: string, b: string, ground: string) => Math.max(contrastRatio(a, ground), contrastRatio(b, ground))

describe('the ring that shows where the keyboard is standing (#1, #2)', () => {
  it('is two bands that read against each other, so neither can vanish into the other', () => {
    expect(contrastRatio(token('--byd-kbd-ring'), token('--byd-kbd-ring-edge'))).toBeGreaterThanOrEqual(3)
    expect(contrastRatio(token('--byd-kbd-open'), token('--byd-kbd-ring-edge'))).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(GROUNDS))('keeps a band that reads on the %s', (_where, ground) => {
    expect(seen(token('--byd-kbd-ring'), token('--byd-kbd-ring-edge'), ground)).toBeGreaterThanOrEqual(3)
  })

  it.each(Object.entries(GROUNDS))('marks what the panel is open on so it reads on the %s', (_where, ground) => {
    expect(seen(token('--byd-kbd-open'), token('--byd-kbd-ring-edge'), ground)).toBeGreaterThanOrEqual(3)
  })
})

describe('the words in the address panel', () => {
  it.each([
    ['a row', '--byd-kbd-ink', '--byd-kbd-control'],
    ['a row that is off', '--byd-kbd-ink-muted', '--byd-kbd-off'],
    ['the hint beside a row', '--byd-kbd-ink-muted', '--byd-kbd-control'],
    ['the panel itself', '--byd-kbd-ink', '--byd-kbd-bg'],
    ['a heading in the panel', '--byd-kbd-ink-muted', '--byd-kbd-bg'],
  ])('reads at AA in %s', (_what, ink, ground) => {
    expect(contrastRatio(token(ink), token(ground))).toBeGreaterThanOrEqual(4.5)
  })
})

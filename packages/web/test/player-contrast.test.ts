import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYER_TEXT_PAIRS, cardFaceRamp, contrastRatio, cssCustomProperties, cssDeclaredUnder } from '../src/player/contrast.js'

// The stylesheet the player view actually ships is the source of truth for its colours — and the
// shared button language (#44) with it, since the phone's first action, its second and the mark on
// what is chosen are drawn from tokens the whole tool holds in common. Only the block bound to
// this surface is read: the same names mean a different colour in the editor, which is the point.
const css = readFileSync(new URL('../src/player/player.css', import.meta.url), 'utf8')
const language = readFileSync(new URL('../src/buttons.css', import.meta.url), 'utf8')
const tokens = cssCustomProperties(`${css}\n${cssDeclaredUnder(language, '.byd-player')}`)
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`player.css and the button language between them declare no ${name}`)
  return value
}

describe('the player view palette', () => {
  it('gives the quiet help text AA contrast against the view background', () => {
    expect(contrastRatio(token('--byd-ink-quiet'), token('--byd-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(PLAYER_TEXT_PAIRS)('gives $what AA contrast', ({ ink, on, size }) => {
    expect(contrastRatio(token(ink), token(on))).toBeGreaterThanOrEqual(size === 'large' ? 3 : 4.5)
  })

  it("gives a hand card's name AA contrast on every hue of the face ramp", () => {
    const ramp = cardFaceRamp(token('--byd-card-face-s'), token('--byd-card-face-l'))
    const worst = Math.min(...ramp.map((face) => contrastRatio(token('--byd-card-ink'), face)))
    expect(worst).toBeGreaterThanOrEqual(4.5)
  })

  it('names only tokens the stylesheet declares, so a removed token fails here', () => {
    for (const pair of PLAYER_TEXT_PAIRS) expect([tokens.has(pair.ink), tokens.has(pair.on)]).toEqual([true, true])
  })
})

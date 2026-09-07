import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PLAYER_TEXT_PAIRS, cardFaceRamp, contrastRatio, cssCustomProperties } from '../src/player/contrast.js'

// The stylesheet the player view actually ships is the source of truth for its colours.
const css = readFileSync(new URL('../src/player/player.css', import.meta.url), 'utf8')
const tokens = cssCustomProperties(css)
const token = (name: string) => {
  const value = tokens.get(name)
  if (!value) throw new Error(`player.css declares no ${name}`)
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

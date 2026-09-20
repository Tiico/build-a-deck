// The card's corner is a physical length, and the wall has to convert it the way the press does
// (#332, L28). Today `.byd-wall-card` says `border-radius: 8px` and means nothing by it: a card is
// 63 mm wide and drawn 150 px, so 8 px happens to be 3.4 mm — near enough to the standard card's
// 3 mm that nobody noticed, and wrong for every other number. A deck whose card is cut square
// gets rounded corners on the wall and sharp ones in the print; a 6 mm corner is drawn at 8 px
// where 14.3 px is the truth.
import { describe, expect, it } from 'vitest'
import { CARD_STANDARD_63x88 } from '@byd/engine'
import type { ComponentTypeDef } from '@byd/engine'
import { cornerPx } from '../src/editor/corner.js'

// The standard card cut at another radius — or, for `undefined`, a type that says nothing about
// its corner at all, which the schema allows.
const cut = (mm: number | undefined): ComponentTypeDef => {
  const { cornerRadiusMm: _, ...physical } = CARD_STANDARD_63x88.physical
  return { ...CARD_STANDARD_63x88, physical: { ...physical, ...(mm === undefined ? {} : { cornerRadiusMm: mm }) } }
}

// Every number here is the millimetres the card is cut at against the pixels it is drawn at, and
// nothing else: 3 mm of a 63 mm card drawn 150 px wide is 150 × 3 / 63.
describe('the card corner the wall draws (#332)', () => {
  it('is the type’s millimetres in the pixels the card is drawn at', () => {
    expect(cornerPx(150, cut(3))).toBeCloseTo(7.14, 2)
    expect(cornerPx(150, cut(6))).toBeCloseTo(14.29, 2)
  })

  it('is nothing at all for a card that is cut square, where today’s 8 px is a rounded corner', () => {
    expect(cornerPx(150, cut(0))).toBe(0)
    expect(cornerPx(90, cut(0))).toBe(0)
    // A type that never says is a type with no rounding to draw.
    expect(cornerPx(150, cut(undefined))).toBe(0)
  })

  it('follows the density, because a smaller card is a smaller corner and not a smaller card with the same corner', () => {
    // The two ends of the ladder in `density.ts`, and the card at arm's length.
    expect(cornerPx(90, cut(3))).toBeCloseTo(4.29, 2)
    expect(cornerPx(220, cut(3))).toBeCloseTo(10.48, 2)
  })

  it('reads the standard card off the type and not off a number written here', () => {
    // Rounded to hundredths of a pixel, which is what a stylesheet can be read in and far below
    // anything an eye can see; the fact itself is the type's two numbers and nothing of this file's.
    expect(cornerPx(150)).toBeCloseTo((150 * (CARD_STANDARD_63x88.physical.cornerRadiusMm ?? 0)) / CARD_STANDARD_63x88.physical.widthMm, 2)
  })
})

import { describe, expect, it } from 'vitest'
import { helpPlacement, type HelpPlacement } from '../src/editor/help-place.js'

// The help box is fixed to the window, so where it lands across is a number and not a side: the
// left edge it would be drawn at, read back out of the style whichever edge the style names.
const leftOf = (at: HelpPlacement, w: number, view: { w: number }): number =>
  at.style.left !== undefined ? parseFloat(String(at.style.left)) : view.w - parseFloat(String(at.style.right)) - w

// A question mark in the middle of a phone, with a box wider than either side of it (#475): «Inget
// spel ännu.» at 390 flipped to hang from the ring's right edge and was drawn at x = −90, because
// the flip only ever asks whether the near side fits and takes the far one on trust.
describe('the help box across a narrow window (#475)', () => {
  const VIEW = { w: 390, h: 844 }
  const WANTS = { w: 260, h: 120 }

  it('stays inside the window when neither side of the question mark has room for it', () => {
    const ask = { x: 150, y: 200, w: 20, h: 20 }
    const left = leftOf(helpPlacement(ask, WANTS, VIEW), WANTS.w, VIEW)
    expect(left).toBeGreaterThanOrEqual(0)
    expect(left + WANTS.w).toBeLessThanOrEqual(VIEW.w)
  })

  it('still hangs from the ring while one side has the room', () => {
    expect(helpPlacement({ x: 20, y: 200, w: 20, h: 20 }, WANTS, VIEW).style.left).toBe('20px')
    expect(helpPlacement({ x: 340, y: 200, w: 20, h: 20 }, WANTS, VIEW).style.right).toBe('30px')
  })
})

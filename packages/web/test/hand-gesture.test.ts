// The recogniser behind the hand strip (K4, K10; #483 fynd 1). A thumb that pans the strip sideways
// is scrolling, and scrolling is not a choice: the strip used to answer the lifted finger with a
// tap on the card it had started on, and a finger that rested before it moved became a hold.
import { describe, expect, it } from 'vitest'
import { HOLD_MS, SCROLL_PX, begin, cancel, end, move, timeout } from '../src/player/gesture.js'

describe('what a thumb on the hand strip did', () => {
  it('is a tap when it lifted where it landed', () => {
    const t = begin(100, 500)
    expect(end(t)).toBe('tap')
  })

  it('is a scroll, and nothing to act on, once it has gone sideways further than a wobble', () => {
    const t = begin(100, 500)
    expect(move(t, 100 + SCROLL_PX, 502)).toBe(null)
    // Nothing that comes after a scroll is a choice: not the timer, not the lift of the finger.
    expect(timeout(t)).toBe(null)
    expect(end(t)).toBe(null)
  })

  it('is nothing when the browser took the gesture over', () => {
    const t = begin(100, 500)
    cancel(t)
    expect(timeout(t)).toBe(null)
    expect(end(t)).toBe(null)
  })

  it('is not a tap when it lifted upward and stopped short of a lift', () => {
    const t = begin(100, 500)
    expect(move(t, 101, 470)).toBe(null)
    expect(end(t)).toBe(null)
  })

  it('still lifts a card drawn upward far enough, and still holds a card rested on', () => {
    const lifted = begin(100, 500)
    expect(move(lifted, 102, 455)).toBe('lift')
    const held = begin(100, 500)
    expect(HOLD_MS).toBeGreaterThan(0)
    // The timer marks the card as held; the hold is the finger coming up still resting on it.
    expect(timeout(held)).toBe(null)
    expect(end(held)).toBe('hold')
  })

  // Re-sorting the hand (K4; #483 fynd 12, beslut A efter prototyp 33): a thumb that rested until
  // the card lifted and then goes sideways is carrying the card along the strip, not scrolling it.
  // Nothing is chosen by it — it is neither a tap nor a hold.
  it('carries the card once it rested until it lifted and then went sideways', () => {
    const t = begin(100, 500)
    timeout(t)
    expect(t.held).toBe(true)
    expect(move(t, 100 - 3 * SCROLL_PX, 501)).toBe('sort')
    expect(move(t, 100 - 6 * SCROLL_PX, 501)).toBe(null)
    expect(end(t)).toBe(null)
  })

  it('is still a scroll when the thumb went sideways before the card lifted', () => {
    const t = begin(100, 500)
    expect(move(t, 100 - 3 * SCROLL_PX, 501)).toBe(null)
    timeout(t)
    expect(end(t)).toBe(null)
    expect(t.decided).toBe('none')
  })

  it('forgives a finger that wobbles less than the threshold', () => {
    const t = begin(100, 500)
    expect(move(t, 100 + SCROLL_PX - 1, 500 - (SCROLL_PX - 1))).toBe(null)
    expect(end(t)).toBe('tap')
  })
})

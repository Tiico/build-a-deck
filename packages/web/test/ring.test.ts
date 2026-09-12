import { describe, expect, it } from 'vitest'
import { RING_MARGIN, ringCentre } from '../src/table/ring.js'

// A ring drawn around the pointer puts Vänd straight above it, and a card near the top of the
// window therefore puts Vänd above the window. The hold hid that: it was rare. A click does not.
describe('where the ring opens', () => {
  const window = { w: 1000, h: 700 }

  it('opens exactly where the hand let go when there is room all around', () => {
    expect(ringCentre({ x: 500, y: 350 }, window)).toEqual({ x: 500, y: 350 })
  })

  it('pulls itself in from every edge, and no further than it has to', () => {
    expect(ringCentre({ x: 500, y: 10 }, window)).toEqual({ x: 500, y: RING_MARGIN })
    expect(ringCentre({ x: 500, y: 690 }, window)).toEqual({ x: 500, y: 700 - RING_MARGIN })
    expect(ringCentre({ x: 4, y: 350 }, window)).toEqual({ x: RING_MARGIN, y: 350 })
    expect(ringCentre({ x: 996, y: 350 }, window)).toEqual({ x: 1000 - RING_MARGIN, y: 350 })
    // A corner is pulled in on both counts at once.
    expect(ringCentre({ x: 2, y: 2 }, window)).toEqual({ x: RING_MARGIN, y: RING_MARGIN })
  })

  it('centres itself in a window too small to hold it rather than choosing one edge to fall off', () => {
    const cramped = { w: RING_MARGIN, h: RING_MARGIN }
    expect(ringCentre({ x: 0, y: 0 }, cramped)).toEqual({ x: RING_MARGIN / 2, y: RING_MARGIN / 2 })
  })
})

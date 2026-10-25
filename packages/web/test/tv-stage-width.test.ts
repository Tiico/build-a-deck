import { describe, expect, it } from 'vitest'
import { STAGE_MAX_PX, STAGE_MIN_PX, feltCardAt, stageWidth } from '../src/table/stage.js'

// How wide the room's stage stands beside the felt (#1290, beslut A): as wide as it can be, up to
// its 760 px, while a card on the felt keeps K9's 45 px — and never narrower than the 360 px
// column it replaced, which is what the felt already had.
//
// The felt is a stand-in for `TableRenderer`'s `onFit`: a table of `w × h` millimetres fitted into
// the frame, with a card 63 mm across.
const feltOf = (mm: { w: number; h: number }, frame: { w: number; h: number }) => ({
  frame,
  cardPxAt: (f: { w: number; h: number }) => 63 * Math.min(1, f.w / mm.w, f.h / mm.h),
})

describe('the stage beside the felt (#1290)', () => {
  it('stands at its full width where the felt can give it and keep its card', () => {
    // A felt bound by its height: a frame 1,000 px wide holds it at 0.9 px per mm, 57 px a card.
    const felt = feltOf({ w: 1000, h: 1100 }, { w: 1528, h: 1000 })
    expect(stageWidth(felt, 360)).toBe(STAGE_MAX_PX)
  })

  it('gives the felt back what keeps its card at 45 px', () => {
    // 1,600 mm wide at 1080 px tall: 45 px a card wants 1,143 px of frame, out of 1,888.
    const felt = feltOf({ w: 1600, h: 1100 }, { w: 1528, h: 1048 })
    const stage = stageWidth(felt, 360)
    expect(stage).toBeGreaterThan(STAGE_MIN_PX)
    expect(stage).toBeLessThan(STAGE_MAX_PX)
    const frame = { w: 1528 + 360 - stage, h: 1048 }
    expect(feltCardAt(felt, frame)).toBeGreaterThanOrEqual(45)
    expect(feltCardAt(felt, { w: frame.w - 8, h: 1048 })).toBeLessThan(45)
  })

  it('keeps the old column where the felt is already under the floor', () => {
    const felt = feltOf({ w: 2400, h: 1100 }, { w: 888, h: 768 })
    expect(stageWidth(felt, 360)).toBe(STAGE_MIN_PX)
  })

  // The camera frames inside the TV's overscan (#322), so the card it draws is a little smaller
  // than the felt's own fit: the floor is held on the card the camera draws.
  it('holds the floor on the card inside the overscan, not on the whole frame', () => {
    const felt = feltOf({ w: 1600, h: 1100 }, { w: 1528, h: 1048 })
    const frame = { w: 1528 + 360 - stageWidth(felt, 360), h: 1048 }
    expect(feltCardAt(felt, frame)).toBeLessThan(felt.cardPxAt(frame))
  })

  it('answers the same whatever stage the frame was measured beside', () => {
    const mm = { w: 1600, h: 1100 }
    const beside360 = stageWidth(feltOf(mm, { w: 1528, h: 1048 }), 360)
    const beside760 = stageWidth(feltOf(mm, { w: 1128, h: 1048 }), 760)
    expect(beside760).toBe(beside360)
  })
})

import { describe, expect, it } from 'vitest'
import { besideDrop, type Box } from '../src/table/besideDrop.js'

// Where the felt says a refused drop (#682, raden E): beside the place the hand let go, on the felt,
// and over nothing a player reads — a card, a pile, a name, a count, the corner's buttons.
const box = (left: number, top: number, w: number, h: number): Box => ({ left, top, right: left + w, bottom: top + h })
const room = box(0, 0, 1000, 700)
const wide = { maxWidth: 420, w: 400, h: 70 }
const narrow = { maxWidth: 260, w: 250, h: 100 }
const at = (x: number, y: number): Box => box(x - 1, y - 1, 2, 2)

describe('the plate beside a refused drop', () => {
  it('stands under the drop, centred on it, when nothing is there', () => {
    expect(besideDrop(at(500, 300), [wide], room, [])).toEqual({ x: 300, y: 313, maxWidth: 420, side: 'under' })
  })

  it('goes over the drop when something lies under it', () => {
    const card = box(450, 320, 100, 140)
    expect(besideDrop(at(500, 300), [wide], room, [card])).toMatchObject({ y: 299 - 12 - 70, side: 'över' })
  })

  it('stays inside the felt, short of its rim', () => {
    const placed = besideDrop(at(990, 690), [wide], room, [])
    expect(placed.x + wide.w).toBeLessThanOrEqual(room.right - 36)
    expect(placed.y + wide.h).toBeLessThanOrEqual(room.bottom - 36)
  })

  it('breaks to more lines rather than cover something, when every wide place would', () => {
    // A row of cards under and over the drop, and the sides closed off, at the wide plate's height
    // but not at the narrow one's corner.
    const obstacles = [box(0, 312, 1000, 80), box(0, 210, 1000, 79), box(0, 290, 480, 20), box(520, 290, 480, 20)]
    const placed = besideDrop(at(500, 300), [wide, narrow], room, obstacles)
    expect(placed.maxWidth).toBe(260)
  })

  it('takes the place that covers least when nothing is free', () => {
    const everything = box(0, 0, 1000, 700)
    const placed = besideDrop(at(500, 300), [wide], room, [everything])
    expect(placed.maxWidth).toBe(420)
    // It never lies on the drop itself, which is what it is about.
    expect(placed.y >= 301 || placed.y + wide.h <= 299 || placed.x >= 501 || placed.x + wide.w <= 499).toBe(true)
  })
})

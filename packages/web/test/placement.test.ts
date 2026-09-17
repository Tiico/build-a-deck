import { describe, expect, it } from 'vitest'
import { placeBox, type Anchor } from '../src/editor/placement.js'

// Where an opened box goes (#229).
//
// Every such box in the editor was hard-set to `top: calc(100% + 6px); left: 0` — always down,
// always left-aligned. A slot near the foot of the page therefore opened a 40vh box below itself
// and the page started to scroll. The direction belongs to the room there is, not to the
// stylesheet, and this is the one reading all of them ask.

const VIEW = { w: 1200, h: 800 }
// A box that wants 300 px of height and 210 of width, which is what `.byd-slot-pop` asks for.
const WANTS = { w: 210, h: 300 }
const anchor = (x: number, y: number, w = 90, h = 28): Anchor => ({ x, y, w, h })

describe('where an opened box goes (#229)', () => {
  it('opens downward when the room below is enough', () => {
    expect(placeBox(anchor(100, 100), WANTS, VIEW).y).toBe('down')
  })

  it('opens upward when the room below is not, and there is more above', () => {
    // A button 60 px from the foot: 740 below the top of it, so 712 under it and 740 over it.
    expect(placeBox(anchor(100, 740), WANTS, VIEW).y).toBe('up')
  })

  it('keeps to the side it is anchored on while the box fits there', () => {
    expect(placeBox(anchor(100, 100), WANTS, VIEW).x).toBe('start')
  })

  it('hangs from the other edge when the box would run off the right', () => {
    expect(placeBox(anchor(1120, 100), WANTS, VIEW).x).toBe('end')
  })

  it('hands over the room on the side it chose, and no more than that', () => {
    // 60 px under the button and 706 over it: it goes up, and the room it reports is that 706.
    const tight = placeBox(anchor(100, 712), WANTS, VIEW)
    expect(tight.y).toBe('up')
    expect(tight.room).toBe(706)
  })

  it('takes the roomier side when neither side can hold the whole box', () => {
    // A tall anchor in a short window: 120 above, 180 below, and the box wants 300.
    const squeezed = placeBox(anchor(100, 120, 90, 500), WANTS, { w: 1200, h: 800 })
    expect(squeezed.y).toBe('down')
    expect(squeezed.room).toBeGreaterThan(0)
  })

  it('does not put a box that has not been laid out yet into no room at all', () => {
    // A box asked before the browser has laid it out reports no height. Taken at its word, a wish
    // of nought fits anywhere — including under a button standing on the window's own foot.
    const unmeasured = placeBox(anchor(100, 770), { w: 0, h: 0 }, VIEW)
    expect(unmeasured.y).toBe('up')
    expect(unmeasured.room).toBeGreaterThan(0)
  })

  it('takes a box’s own floor and its own air when it has them', () => {
    // The column door keeps a floor of 240 and 24 px of air: a door shorter than that is not a
    // door, and the air is its shadow's room plus a padding that stands outside its height. Those
    // are the door's decisions and the shared reading must carry them, not overrule them.
    const door = { least: 240, gap: 24 }
    // 500 under the anchor and 260 over it: the box wants 300, so down is where it goes.
    expect(placeBox(anchor(100, 284), WANTS, VIEW, door).y).toBe('down')
    // 200 under and 560 over: under the door's own floor, so it turns and opens upward.
    expect(placeBox(anchor(100, 584), WANTS, VIEW, door).y).toBe('up')
    // And the air it keeps is its own, not the 6 px everything else keeps.
    expect(placeBox(anchor(100, 100), { w: 210, h: 5000 }, VIEW, door).room).toBe(VIEW.h - 128 - 24)
  })

  it('holds a box open at its own least even in a window shorter than that', () => {
    // A 120 px window has 96 px under an anchor at its top, which is under the door's floor of 240.
    // The door is held open at 240 and the list scrolls inside it, as it always did.
    expect(placeBox(anchor(100, 0, 90, 0), WANTS, { w: 1200, h: 120 }, { least: 240, gap: 24 }).room).toBe(240)
  })

  it('leaves the box its full height when the room is there, so nothing scrolls inside it for nothing', () => {
    expect(placeBox(anchor(100, 100), WANTS, VIEW).room).toBeGreaterThanOrEqual(WANTS.h)
  })
})

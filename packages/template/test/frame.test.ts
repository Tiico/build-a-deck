import { describe, expect, it } from 'vitest'
import { frameWindow, drawnAt, type Frame } from '../src/frame.js'
import type { Motif } from '../src/motif.js'

// A file as the measurement leaves it: the file's own pixels, and the air around what is drawn.
const file = (w: number, h: number, box: { x: number; y: number; w: number; h: number }): Motif => ({
  w,
  h,
  trim: { left: box.x, top: box.y, right: w - box.x - box.w, bottom: h - box.y - box.h },
})

const CENTRED: Frame = { fill: 0.8, anchor: 'centre' }

describe('the window a deck’s measure cuts out of a file (E1)', () => {
  it('gives the drawing the share of the frame the measure asks for', () => {
    // A 400-tall drawing that should fill four fifths of the frame needs a 500-tall window.
    const art = file(1000, 1000, { x: 300, y: 300, w: 200, h: 400 })

    expect(frameWindow(art, CENTRED, 1)).toEqual({ x: 150, y: 250, w: 500, h: 500, short: false })
  })

  it('holds a wide drawing by its width, so it cannot run out through the sides', () => {
    // Held by the height alone this 600-wide drawing would ask for a 500-wide window and lose
    // a hundred pixels of itself off both edges. The binding side is the width.
    const art = file(2000, 1000, { x: 700, y: 300, w: 600, h: 400 })

    const win = frameWindow(art, CENTRED, 1)

    expect(win.w).toBe(750)
    expect(win.w).toBeGreaterThanOrEqual(600)
    expect(drawnAt(art, win)).toBeCloseTo(0.8)
  })

  it('shapes the window like the frame, whatever the file is shaped like', () => {
    const art = file(1000, 1000, { x: 400, y: 300, w: 200, h: 400 })

    const win = frameWindow(art, CENTRED, 2)

    expect(win.w / win.h).toBeCloseTo(2)
  })

  it('stands the drawings on one line when the measure says foot', () => {
    // Two files whose drawings sit at different heights put the same air under both.
    const tall = file(1000, 1000, { x: 400, y: 100, w: 200, h: 400 })
    const low = file(1000, 1000, { x: 400, y: 500, w: 200, h: 400 })
    const foot: Frame = { fill: 0.8, anchor: 'foot' }

    const under = (m: Motif) => {
      const win = frameWindow(m, foot, 1)
      return win.y + win.h - (m.trim.top + (m.h - m.trim.top - m.trim.bottom))
    }

    expect(under(tall)).toBeCloseTo(under(low))
    expect(under(tall)).toBeCloseTo(50)
  })

  it('says when the file does not hold what the measure asks for', () => {
    // A file delivered cropped to the drawing has no air to give: at four fifths the window
    // would have to be larger than the file itself.
    const cropped = file(1000, 1000, { x: 0, y: 0, w: 1000, h: 1000 })

    expect(frameWindow(cropped, CENTRED, 1).short).toBe(true)
    expect(frameWindow(cropped, { fill: 1, anchor: 'centre' }, 1).short).toBe(false)
  })

  it('slides a window that has fallen off the edge back inside the file', () => {
    // The drawing sits hard against the left edge, so a centred window starts at -100.
    const edge = file(1000, 1000, { x: 0, y: 300, w: 200, h: 400 })

    const win = frameWindow(edge, CENTRED, 1)

    expect(win.x).toBe(0)
    expect(win.w).toBe(500)
    // Sliding is not shrinking: the file still holds every pixel the measure asked for.
    expect(win.short).toBe(false)
  })

  it('shrinks a window the file cannot hold, rather than sampling air that was never drawn', () => {
    const cropped = file(600, 400, { x: 0, y: 0, w: 600, h: 400 })

    const win = frameWindow(cropped, CENTRED, 1)

    expect(win).toEqual({ x: 100, y: 0, w: 400, h: 400, short: true })
    // And the drawing is then drawn larger than the measure asked for, which is the truth the
    // card will show and what the deck's count has to be told.
    expect(drawnAt(cropped, win)).toBeGreaterThan(0.8)
  })

  it('takes the card’s own departure from the measure, and takes it after the measure', () => {
    const art = file(1000, 1000, { x: 300, y: 300, w: 200, h: 400 })

    const closer = frameWindow(art, CENTRED, 1, { zoom: 2 })

    expect(closer).toEqual({ x: 275, y: 375, w: 250, h: 250, short: false })
    expect(drawnAt(art, closer)).toBeCloseTo(1.6)
  })

  it('moves the window by a share of itself, so a nudge means the same at every zoom', () => {
    const art = file(1000, 1000, { x: 300, y: 300, w: 200, h: 400 })

    expect(frameWindow(art, CENTRED, 1, { dx: 0.1 }).x).toBe(200)
    expect(frameWindow(art, CENTRED, 1, { dy: -0.1 }).y).toBe(200)
  })
})

import { describe, expect, it } from 'vitest'
import { frameWindow, type Frame } from '../src/frame.js'
import type { Motif } from '../src/motif.js'

// A file as the measurement leaves it: the file's own pixels, and the air around what is drawn.
const file = (w: number, h: number, box: { x: number; y: number; w: number; h: number }): Motif => ({
  w,
  h,
  trim: { left: box.x, top: box.y, right: w - box.x - box.w, bottom: h - box.y - box.h },
})

const CENTRED: Frame = { fill: 0.8 }

describe('the window a deck’s measure cuts out of a file (E1)', () => {
  it('gives the drawing the share of the frame the measure asks for', () => {
    // A 400-tall drawing that should fill four fifths of the frame needs a 500-tall window.
    const art = file(1000, 1000, { x: 300, y: 300, w: 200, h: 400 })

    expect(frameWindow(art, CENTRED, 1)).toEqual({ x: 150, y: 250, w: 500, h: 500 })
  })

  it('holds a wide drawing by its width, so it cannot run out through the sides', () => {
    // Held by the height alone this 600-wide drawing would ask for a 500-wide window and lose
    // a hundred pixels of itself off both edges. The binding side is the width.
    const art = file(2000, 1000, { x: 700, y: 300, w: 600, h: 400 })

    const win = frameWindow(art, CENTRED, 1)

    expect(win.w).toBe(750)
    expect(win.w).toBeGreaterThanOrEqual(600)
    // And the drawing fills four fifths of it across, which is the measure.
    expect(600 / win.w).toBeCloseTo(0.8)
  })

  it('shapes the window like the frame, whatever the file is shaped like', () => {
    const art = file(1000, 1000, { x: 400, y: 300, w: 200, h: 400 })

    const win = frameWindow(art, CENTRED, 2)

    expect(win.w / win.h).toBeCloseTo(2)
  })

  it('puts the drawing in the middle of its window, whatever the file is shaped like (#221)', () => {
    // Two files whose drawings sit at different heights are each centred in their own window,
    // which is the whole of the placement since the ground line was retired.
    const high = file(1000, 1000, { x: 400, y: 100, w: 200, h: 400 })
    const low = file(1000, 1000, { x: 400, y: 500, w: 200, h: 400 })

    const around = (m: Motif) => {
      const win = frameWindow(m, CENTRED, 1)
      const art = { y: m.trim.top, h: m.h - m.trim.top - m.trim.bottom }
      return { above: art.y - win.y, below: win.y + win.h - (art.y + art.h) }
    }

    expect(around(high).above).toBeCloseTo(around(high).below)
    expect(around(low)).toEqual(around(high))
  })

  it('slides a window that has fallen off the edge back inside the file', () => {
    // The drawing sits hard against the left edge, so a centred window starts at -100.
    const edge = file(1000, 1000, { x: 0, y: 300, w: 200, h: 400 })

    const win = frameWindow(edge, CENTRED, 1)

    expect(win.x).toBe(0)
    // Sliding is not shrinking: the file still holds every pixel the measure asked for.
    expect(win.w).toBe(500)
  })

  it('shrinks a window the file cannot hold, rather than sampling air that was never drawn', () => {
    const cropped = file(600, 400, { x: 0, y: 0, w: 600, h: 400 })

    const win = frameWindow(cropped, CENTRED, 1)

    expect(win).toEqual({ x: 100, y: 0, w: 400, h: 400 })
  })
})

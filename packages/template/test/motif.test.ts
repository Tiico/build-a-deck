import { describe, expect, it } from 'vitest'
import { motifOf, type Pixels } from '../src/motif.js'

type Rgba = [number, number, number, number]
const TRANSPARENT: Rgba = [0, 0, 0, 0]
const WHITE: Rgba = [255, 255, 255, 255]
const INK: Rgba = [224, 43, 43, 255]

// A picture as bytes: a ground, and a rectangle of something else drawn on it. What is asked of
// the scan is only where the drawing starts and stops, so the drawing needs no detail.
function picture(w: number, h: number, ground: Rgba, box?: { x: number; y: number; w: number; h: number; of: Rgba }): Pixels {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = box !== undefined && x >= box.x && x < box.x + box.w && y >= box.y && y < box.y + box.h
      data.set(inside ? box.of : ground, (y * w + x) * 4)
    }
  }
  return { width: w, height: h, data }
}

describe('the motif inside a picture (E1)', () => {
  it('measures the transparent border a drawing carries', () => {
    const art = picture(100, 100, TRANSPARENT, { x: 20, y: 10, w: 50, h: 70, of: INK })

    expect(motifOf(art)).toEqual({ w: 100, h: 100, trim: { left: 20, top: 10, right: 30, bottom: 20 } })
  })

  it('measures a border of one flat colour the same way', () => {
    const art = picture(40, 20, WHITE, { x: 4, y: 2, w: 30, h: 16, of: INK })

    expect(motifOf(art)).toEqual({ w: 40, h: 20, trim: { left: 4, top: 2, right: 6, bottom: 2 } })
  })

  it('forgives the noise a photograph carries in its ground', () => {
    const art = picture(20, 20, WHITE, { x: 5, y: 5, w: 10, h: 10, of: INK })
    // One pixel of the ground a shade off, as a compressed file has all over it.
    art.data.set([250, 252, 255, 255], (1 * 20 + 1) * 4)

    expect(motifOf(art).trim).toEqual({ left: 5, top: 5, right: 5, bottom: 5 })
  })

  it('leaves a picture that runs to its own edges alone', () => {
    expect(motifOf(picture(30, 30, INK)).trim).toEqual({ left: 0, top: 0, right: 0, bottom: 0 })
  })

  it('leaves a picture whose corners disagree alone, because a ground it cannot name is a drawing', () => {
    const art = picture(20, 20, WHITE, { x: 5, y: 5, w: 10, h: 10, of: INK })
    art.data.set(INK, 0)

    expect(motifOf(art).trim).toEqual({ left: 0, top: 0, right: 0, bottom: 0 })
  })

  it('leaves a picture that is nothing but ground alone, since there is no motif to fit', () => {
    expect(motifOf(picture(16, 16, TRANSPARENT)).trim).toEqual({ left: 0, top: 0, right: 0, bottom: 0 })
  })

  it('says nothing of a picture with no pixels at all', () => {
    expect(motifOf({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toEqual({ w: 0, h: 0, trim: { left: 0, top: 0, right: 0, bottom: 0 } })
  })
})

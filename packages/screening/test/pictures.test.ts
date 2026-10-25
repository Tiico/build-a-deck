import { describe, expect, it } from 'vitest'
import { picture } from '../contract/suite.js'
import { onWhite, planar, resample, squareTiles } from '../src/pictures.js'

// What a model is shown of a picture (#1273): the worker's pixels on white, scaled and cut to the
// square the model was trained on, channel by channel. Written here rather than taken from a
// library, since the worker already has the pixels and a model wants nothing but numbers.

const close = (a: ArrayLike<number>, b: number, eps = 1e-5) => Array.from(a).every((x) => Math.abs(x - b) < eps)

describe('bilden som en modell ser den', () => {
  it('läser genomskinligt som vitt och färg som andelar av 255', () => {
    const rgb = onWhite(picture(2, 1, (u) => (u < 0.5 ? [0, 0, 0, 0] : [255, 0, 51, 255])))
    expect(Array.from(rgb)).toEqual([1, 1, 1, 1, 0, Math.fround(0.2)])
  })

  it('skalar en jämn yta till samma yta, och ett rutmönster ner till dess medel', () => {
    const flat = onWhite(picture(37, 23, () => [102, 102, 102, 255]))
    expect(close(resample(flat, 37, 23, 384, 384), 0.4)).toBe(true)
    expect(close(resample(flat, 37, 23, 5, 3), 0.4)).toBe(true)
    const checks = onWhite(picture(64, 64, (u, v) => ((Math.floor(u * 64) + Math.floor(v * 64)) % 2 ? [255, 255, 255, 255] : [0, 0, 0, 255])))
    expect(close(resample(checks, 64, 64, 8, 8), 0.5, 0.02)).toBe(true)
  })

  it('lämnar en bild i sin egen storlek som den är', () => {
    const p = onWhite(picture(4, 3, (u, v) => [Math.round(u * 255), Math.round(v * 255), 0, 255]))
    expect(Array.from(resample(p, 4, 3, 4, 3))).toEqual(Array.from(p))
  })

  // A card's art is seldom square, and a model's square crop of it would leave out its ends; so
  // the picture is seen as squares along its long side, the first at one end and the last at the
  // other, and what the model finds in any of them is what it finds in the picture.
  it('delar en avlång bild i rutor längs den långa sidan, från ände till ände', () => {
    const shape = (w: number, h: number) => squareTiles(onWhite(picture(w, h, () => [0, 0, 0, 255])), w, h, 224)
    expect(shape(300, 300)).toHaveLength(1)
    expect(shape(320, 340)).toHaveLength(1)
    expect(shape(200, 300)).toHaveLength(2)
    expect(shape(512, 128)).toHaveLength(3)
    expect(shape(1, 1)).toHaveLength(1)
    for (const tile of shape(512, 128)) expect(tile).toHaveLength(224 * 224 * 3)

    // A picture dark at the left end and light at the right: the first tile holds the dark end and
    // the last the light one.
    const ramp = onWhite(picture(600, 200, (u) => (u < 0.1 ? [0, 0, 0, 255] : u > 0.9 ? [255, 255, 255, 255] : [128, 128, 128, 255])))
    const tiles = squareTiles(ramp, 600, 200, 224)
    expect(tiles[0]?.[0]).toBeCloseTo(0, 2)
    expect(tiles.at(-1)?.at(-1)).toBeCloseTo(1, 2)
  })

  it('lägger kanalerna efter varandra och normaliserar dem', () => {
    const rgb = Float32Array.from([1, 0.5, 0, 1, 0.5, 0])
    expect(Array.from(planar(rgb, 2, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5]))).toEqual([1, 1, 0, 0, -1, -1])
  })
})

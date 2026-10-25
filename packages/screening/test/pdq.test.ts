import { describe, expect, it } from 'vitest'
import { negative, picture, scene, shrink } from '../contract/suite.js'
import { hammingDistance, pdq } from '../src/index.js'

// PDQ (Meta's 256-bit perceptual hash, ThreatExchange, BSD) in our own code, since no PDQ is kept
// up as an npm package (#1268). It is the hash a reference list is compared by (F4, beslut 9), and
// the one hash lists from others are shared in, so it has to be PDQ and not only something like it.
//
// The reference hashes below are Meta's own C++ implementation, through the `pdqhash` Python
// package (0.2.7), run on the same pixels as these tests: `scene()` from the contract fixture,
// with JavaScript's rounding. Ours is bit for bit the same, quality and all.
const REFERENCE: Record<string, { hex: string; quality: number }> = {
  '512x512': { hex: 'cc4e33b0cc4e8d8f62716e7f91996c774cceb33072728d883272766e899199b1', quality: 93 },
  '320x240': { hex: '4e4eb1b1cc4e8dcf72716e7f91996e674cceb33032328d883272766e899189b1', quality: 94 },
  '96x512': { hex: '4e4eb1b04e4e8dcf72316e7791997e774eceb33032328d8832727666899989b1', quality: 94 },
  '64x64': { hex: 'ce36b1987e708dce72716e77919976714eceb130b2324dc8b23272668d9989b1', quality: 96 },
}

describe('PDQ', () => {
  it('ger 256 bitar som Metas egen implementation, och samma kvalitet', () => {
    for (const [size, ref] of Object.entries(REFERENCE)) {
      const [w, h] = size.split('x').map(Number) as [number, number]
      const { hash, quality } = pdq(scene(w, h))
      expect(hash.algorithm, size).toBe('pdq-256')
      expect(hash.bits, size).toMatch(/^[0-9a-f]{64}$/)
      expect(hash.bits, size).toBe(ref.hex)
      expect(quality, size).toBe(ref.quality)
    }
  })

  it('är nära för samma bild i en annan storlek och långt för en annan bild', () => {
    const big = scene(512, 512)
    const a = pdq(big).hash
    expect(hammingDistance(a, pdq(shrink(big, 4)).hash)).toBeLessThanOrEqual(16)
    expect(hammingDistance(a, pdq(negative(big)).hash)).toBeGreaterThanOrEqual(200)
  })

  // A picture with nothing in it hashes to something that says nothing; quality is how PDQ says
  // so, and a hash under PDQ's own floor of 50 is never a match (#1273).
  it('säger låg kvalitet för en bild utan innehåll', () => {
    expect(pdq(picture(64, 64, () => [200, 200, 200, 255])).quality).toBe(0)
    expect(pdq(picture(64, 64, () => [0, 0, 0, 0])).quality).toBe(0)
    expect(pdq(picture(1, 1, () => [200, 10, 10, 255])).quality).toBe(0)
  })

  it('läser genomskinligt som vitt, som ett tryckt kort visar det', () => {
    const onWhite = picture(128, 96, (u, v) => (u + v > 1 ? [20, 20, 20, 255] : [255, 255, 255, 255]))
    const transparent = picture(128, 96, (u, v) => (u + v > 1 ? [20, 20, 20, 255] : [0, 0, 0, 0]))
    expect(pdq(transparent).hash).toEqual(pdq(onWhite).hash)
  })
})

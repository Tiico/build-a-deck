import { describe, expect, it } from 'vitest'
import { picture, scene, shrink } from '../contract/suite.js'
import { createFakeClassifier, FAKE_CLASSIFIER, hammingDistance, highestScore } from '../src/index.js'

const fake = createFakeClassifier()

describe('fake-klassificeraren', () => {
  it('heter fake i version 1', () => {
    expect({ id: fake.id, version: fake.version }).toEqual(FAKE_CLASSIFIER)
  })

  // Made up out of colour, so that a test of what comes after — the cache, the report and its
  // threshold — can make a picture that scores high on purpose.
  it('ger våld efter andelen stark röd och sexuellt efter andelen stark magenta', async () => {
    expect((await fake.classify(picture(10, 10, () => [230, 20, 20, 255]))).scores).toEqual({ sexual: 0, violence: 1 })
    expect((await fake.classify(picture(10, 10, () => [230, 20, 230, 255]))).scores).toEqual({ sexual: 1, violence: 0 })
    expect((await fake.classify(picture(10, 10, (u) => (u < 0.3 ? [230, 20, 20, 255] : [255, 255, 255, 255])))).scores).toEqual({ sexual: 0, violence: 0.3 })
    // Red that is not there — transparent — is not red.
    expect((await fake.classify(picture(10, 10, () => [230, 20, 20, 0]))).scores).toEqual({ sexual: 0, violence: 0 })
  })

  it('ger 64 bitar dHash, nära för samma bild och långt för en annan', async () => {
    const a = (await fake.classify(scene(512, 512))).imageHash
    expect(a.algorithm).toBe('dhash-64')
    expect(a.bits).toMatch(/^[0-9a-f]{16}$/)
    expect(hammingDistance(a, (await fake.classify(shrink(scene(512, 512), 4))).imageHash)).toBeLessThanOrEqual(2)
  })
})

describe('hammingDistance', () => {
  it('räknar bitarna som skiljer, och vägrar jämföra olika algoritmer eller längder', () => {
    expect(hammingDistance({ algorithm: 'x', bits: '00ff' }, { algorithm: 'x', bits: '0f0f' })).toBe(8)
    expect(hammingDistance({ algorithm: 'x', bits: 'ab' }, { algorithm: 'x', bits: 'ab' })).toBe(0)
    expect(() => hammingDistance({ algorithm: 'x', bits: 'ab' }, { algorithm: 'y', bits: 'ab' })).toThrow()
    expect(() => hammingDistance({ algorithm: 'x', bits: 'ab' }, { algorithm: 'x', bits: 'abcd' })).toThrow()
  })
})

describe('highestScore', () => {
  it('säger vilken kategori som väger tyngst', () => {
    expect(highestScore({ sexual: 0.2, violence: 0.7 })).toEqual({ category: 'violence', score: 0.7 })
    expect(highestScore({ sexual: 0.9, violence: 0.7 })).toEqual({ category: 'sexual', score: 0.9 })
  })
})

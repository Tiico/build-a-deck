import { describe, expect, it } from 'vitest'
import { ClassifierRef, hammingDistance, MAX_SCREEN_PX, Screening, type Classifier, type Pixels } from '../src/index.js'
import { negative, scene, SHAPES, shrink } from './fixture.js'

export { negative, picture, scene, SHAPES, shrink } from './fixture.js'

export type ContractSubject = {
  classifier: () => Classifier
}

// What every classifier is held to (F4, #1268), the fake and every real one after it (slice 4).
// The suite cannot say whether a classifier is right about a picture; that is measured against
// real card art when a real one is chosen (#1273). It says that the answer has the contract's form
// for any picture the worker can draw, that it is the same answer every time, and that the hash is
// perceptual: the same picture at another size is near, and another picture is far.
export function classifierContract(name: string, subject: ContractSubject): void {
  describe(`klassificerarkontraktet: ${name}`, () => {
    it('har ett id och en version', () => {
      const c = subject.classifier()
      expect(() => ClassifierRef.parse({ id: c.id, version: c.version })).not.toThrow()
    })

    it('ger en poäng mellan 0 och 1 för varje kategori i den slutna listan, och en bildhash, för varje form en bild kan ha', async () => {
      const c = subject.classifier()
      for (const { name, pixels } of SHAPES) {
        expect(Math.max(pixels.width, pixels.height), name).toBeLessThanOrEqual(MAX_SCREEN_PX)
        const answer = await c.classify(pixels)
        expect(() => Screening.parse(answer), name).not.toThrow()
      }
    })

    it('svarar likadant för samma pixlar, och lämnar pixlarna orörda', async () => {
      const c = subject.classifier()
      const pixels = scene(320, 240)
      const before = new Uint8ClampedArray(pixels.data)
      const first = await c.classify(pixels)
      expect(Buffer.from(pixels.data).equals(Buffer.from(before))).toBe(true)
      expect(await c.classify({ ...pixels, data: new Uint8ClampedArray(before) })).toEqual(first)
      expect(await subject.classifier().classify(pixels)).toEqual(first)
    })

    it('ger samma bild i en annan storlek en närliggande hash, och en annan bild en avlägsen', async () => {
      const c = subject.classifier()
      const big = scene(512, 512)
      const { imageHash: a } = Screening.parse(await c.classify(big))
      const { imageHash: half } = Screening.parse(await c.classify(shrink(big, 2)))
      const { imageHash: quarter } = Screening.parse(await c.classify(shrink(big, 4)))
      const { imageHash: other } = Screening.parse(await c.classify(negative(big)))
      const bits = a.bits.length * 4
      expect(bits).toBeGreaterThanOrEqual(64)
      expect(hammingDistance(a, half)).toBeLessThanOrEqual(bits * 0.1)
      expect(hammingDistance(a, quarter)).toBeLessThanOrEqual(bits * 0.1)
      expect(hammingDistance(a, other)).toBeGreaterThanOrEqual(bits * 0.25)
    })

    it('vägrar pixlar som inte är en bild', async () => {
      const c = subject.classifier()
      const bad: Pixels[] = [
        { width: 0, height: 4, data: new Uint8ClampedArray(0) },
        { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 3) },
        { width: 2.5, height: 2, data: new Uint8ClampedArray(20) },
      ]
      for (const pixels of bad) await expect(c.classify(pixels), `${pixels.width} × ${pixels.height}`).rejects.toThrow()
    })
  })
}

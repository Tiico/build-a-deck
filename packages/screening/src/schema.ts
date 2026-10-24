import { z } from 'zod'

// What crosses the line between the platform and a classifier (F4, #1268), as data with its
// validation: the pixels a classifier is shown, the answer it gives, and the result kept per
// picture. A classifier is to screening what a `PrintProvider` is to print (#1206): one contract,
// a fake that stands where a real one will, and a suite every classifier is held to.

// The closed list of what a picture is scored for. A classifier scores every one of them and
// nothing else, so a result from one classifier reads like a result from any other; a category
// is added here, and to every classifier, or not at all.
export const SCREEN_CATEGORIES = ['sexual', 'violence'] as const
export const ScreenCategory = z.enum(SCREEN_CATEGORIES)
export type ScreenCategory = z.infer<typeof ScreenCategory>

// How likely the picture is to be of the category, from 0 to 1. What a score means beyond its
// order is the classifier's own, which is why a result always names the classifier and its version.
const Score = z.number().min(0).max(1)
export const Scores = z.strictObject({ sexual: Score, violence: Score } satisfies Record<ScreenCategory, typeof Score>)
export type Scores = z.infer<typeof Scores>

// Which classifier, and which version of it. A result is kept under both, so a new version
// screens a picture again and an old result is never read as the new one's (F4).
export const ClassifierRef = z.object({ id: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, 'an id is lower-case letters, digits, «.» and «-»'), version: z.string().min(1) })
export type ClassifierRef = z.infer<typeof ClassifierRef>
export const classifierKey = (ref: ClassifierRef): string => `${ref.id}@${ref.version}`

// A perceptual hash of the picture, compared to another of the same algorithm by Hamming distance
// (#1268, pipeline step 4): close for the same picture at another size, far for another picture.
// The algorithm is named because PDQ and pHash are not comparable with each other.
export const PerceptualHash = z.object({ algorithm: z.string().min(1), bits: z.string().regex(/^(?:[0-9a-f]{2})+$/, 'the bits are whole bytes in lower-case hex') })
export type PerceptualHash = z.infer<typeof PerceptualHash>

// What a classifier answers for one picture.
export const Screening = z.strictObject({ scores: Scores, imageHash: PerceptualHash })
export type Screening = z.infer<typeof Screening>

// The picture as a classifier sees it: drawn by Chromium in the render worker, at most
// MAX_SCREEN_PX on its longer side, as RGBA bytes row by row from the top left, not premultiplied
// (what a canvas's `getImageData` gives).
export type Pixels = { width: number; height: number; data: Uint8ClampedArray }
export const MAX_SCREEN_PX = 512

// Throws for pixels that are not a picture: no area, or bytes that do not fill it exactly.
export function checkPixels(pixels: Pixels): Pixels {
  const { width, height, data } = pixels
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error(`a picture is whole pixels, not ${width} × ${height}`)
  if (!(data instanceof Uint8ClampedArray) || data.length !== width * height * 4) throw new Error(`${width} × ${height} pixels are ${width * height * 4} bytes of RGBA, not ${data?.length}`)
  return pixels
}

// One picture's result, kept once per asset, classifier and version (F4: the same picture is
// screened once). `screenedAt` is in ms, the clock of the render queue.
export const Sha256 = z.string().regex(/^[0-9a-f]{64}$/)
export const ScreeningResult = z.object({ asset: Sha256, classifier: ClassifierRef, scores: Scores, imageHash: PerceptualHash, screenedAt: z.number().int().nonnegative() })
export type ScreeningResult = z.infer<typeof ScreeningResult>

// How many bits two hashes of the same algorithm differ in.
export function hammingDistance(a: PerceptualHash, b: PerceptualHash): number {
  if (a.algorithm !== b.algorithm) throw new Error(`a ${a.algorithm} hash is not comparable with a ${b.algorithm} one`)
  if (a.bits.length !== b.bits.length) throw new Error(`hashes of ${a.bits.length * 4} and ${b.bits.length * 4} bits are not comparable`)
  let distance = 0
  for (let i = 0; i < a.bits.length; i += 2) {
    let x = parseInt(a.bits.slice(i, i + 2), 16) ^ parseInt(b.bits.slice(i, i + 2), 16)
    for (; x; x &= x - 1) distance++
  }
  return distance
}

// The highest score a result has, and in which category: what a threshold is held against.
export function highestScore(scores: Scores): { category: ScreenCategory; score: number } {
  return SCREEN_CATEGORIES.map((category) => ({ category, score: scores[category] })).reduce((a, b) => (b.score > a.score ? b : a))
}

import { z } from 'zod'
import { PDQ_ALGORITHM, PDQ_MATCH_DISTANCE, PDQ_MIN_QUALITY } from './pdq.js'
import { hammingDistance, type PerceptualHash } from './schema.js'

// The reference list (F4, beslut 9; #1273): PDQ hashes of pictures that must not be printed. It
// starts with what has been taken down, which is nothing yet, and can be filled from hash lists
// others share in PDQ, without a picture being fetched. It is kept in the database, never in the
// public repo, and the operator fills it with `screening reference` (DRIFT §12).

export const ScreeningReference = z.object({
  imageHash: z.object({ algorithm: z.literal(PDQ_ALGORITHM), bits: z.string().regex(/^[0-9a-f]{64}$/), quality: z.number().int().min(0).max(100).optional() }),
  // Where it comes from, in the operator's words: a takedown and its date, or the list it came in.
  source: z.string().min(1),
  addedAt: z.number().int().nonnegative(),
})
export type ScreeningReference = z.infer<typeof ScreeningReference>

const saysEnough = (hash: { quality?: number | undefined }) => hash.quality === undefined || hash.quality >= PDQ_MIN_QUALITY

// The nearest reference within PDQ's threshold, or null. A hash of another algorithm, or one of a
// picture with too little in it, matches nothing.
export function matchReference(hash: PerceptualHash, references: readonly ScreeningReference[]): { reference: ScreeningReference; distance: number } | null {
  if (hash.algorithm !== PDQ_ALGORITHM || !saysEnough(hash)) return null
  let best: { reference: ScreeningReference; distance: number } | null = null
  for (const reference of references) {
    if (!saysEnough(reference.imageHash)) continue
    const distance = hammingDistance(hash, reference.imageHash)
    if (distance <= PDQ_MATCH_DISTANCE && (!best || distance < best.distance)) best = { reference, distance }
  }
  return best
}

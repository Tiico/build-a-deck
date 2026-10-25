import type { Pixels, Screening } from './schema.js'

// The contract a classifier keeps (F4, #1268), as `PrintProvider` is for a print partner (#1206):
// nothing else in the platform knows which classifier it is, and every one passes the same suite
// (`@byd/screening/contract`). The render worker draws the picture and hands the pixels over, so a
// classifier does no I/O on the platform's behalf and never decodes a file itself.
export type Classifier = {
  // Which classifier and which version: a result is kept under both (`ClassifierRef`).
  readonly id: string
  readonly version: string
  // A score per category of the closed list, and a perceptual hash, for one picture. Rejects
  // pixels that are not a picture (`checkPixels`). The same pixels give the same answer.
  classify(pixels: Pixels): Promise<Screening>
}

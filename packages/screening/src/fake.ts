import type { Classifier } from './classifier.js'
import { checkPixels, type PerceptualHash, type Pixels, type Scores, type Screening } from './schema.js'

export const FAKE_CLASSIFIER = { id: 'fake', version: '1' } as const

// A classifier that stands where a real one will (slice 4, #1273): it passes the contract suite
// every classifier is held to, runs no model and knows nothing about pictures. Its scores are made
// up out of colour so that a test can make a picture score high on purpose: `violence` is the share
// of the picture that is strong red, `sexual` the share that is strong magenta. Its hash is a real,
// if crude, perceptual hash (dHash, 64 bits), so the suite's demand on the hash is one it meets.
export function createFakeClassifier(): Classifier {
  return {
    ...FAKE_CLASSIFIER,
    async classify(pixels: Pixels): Promise<Screening> {
      checkPixels(pixels)
      return { scores: colourScores(pixels), imageHash: dHash(pixels) }
    },
  }
}

const opaque = (data: Uint8ClampedArray, i: number) => (data[i + 3] ?? 0) >= 128
const isRed = (data: Uint8ClampedArray, i: number) => opaque(data, i) && (data[i] ?? 0) >= 192 && (data[i + 1] ?? 0) <= 64 && (data[i + 2] ?? 0) <= 64
const isMagenta = (data: Uint8ClampedArray, i: number) => opaque(data, i) && (data[i] ?? 0) >= 192 && (data[i + 1] ?? 0) <= 64 && (data[i + 2] ?? 0) >= 192

function colourScores({ width, height, data }: Pixels): Scores {
  let red = 0
  let magenta = 0
  for (let i = 0; i < data.length; i += 4) {
    if (isRed(data, i)) red++
    else if (isMagenta(data, i)) magenta++
  }
  const n = width * height
  return { sexual: magenta / n, violence: red / n }
}

// The picture's light, on white where it is transparent, as a printed card would show it.
const lightAt = (data: Uint8ClampedArray, i: number): number => {
  const a = (data[i + 3] ?? 0) / 255
  const lum = 0.299 * (data[i] ?? 0) + 0.587 * (data[i + 1] ?? 0) + 0.114 * (data[i + 2] ?? 0)
  return lum * a + 255 * (1 - a)
}

// The difference hash: the picture shrunk to 9 × 8 cells of mean light, and one bit per pair of
// neighbours in a row, set where the light rises to the right.
function dHash({ width, height, data }: Pixels): PerceptualHash {
  const cols = 9
  const rows = 8
  const span = (i: number, n: number, of: number) => {
    const from = Math.min(Math.floor((i * of) / n), of - 1)
    return [from, Math.max(from + 1, Math.floor(((i + 1) * of) / n))] as const
  }
  const cells: number[] = []
  for (let r = 0; r < rows; r++) {
    const [y0, y1] = span(r, rows, height)
    for (let c = 0; c < cols; c++) {
      const [x0, x1] = span(c, cols, width)
      let sum = 0
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) sum += lightAt(data, (y * width + x) * 4)
      cells.push(sum / ((y1 - y0) * (x1 - x0)))
    }
  }
  let bits = ''
  for (let r = 0; r < rows; r++) {
    let byte = 0
    for (let c = 0; c < cols - 1; c++) byte = (byte << 1) | ((cells[r * cols + c + 1] ?? 0) > (cells[r * cols + c] ?? 0) ? 1 : 0)
    bits += byte.toString(16).padStart(2, '0')
  }
  return { algorithm: 'dhash-64', bits }
}

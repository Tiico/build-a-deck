import { checkPixels, type PerceptualHash, type Pixels } from './schema.js'

// PDQ, Meta's 256-bit perceptual hash (ThreatExchange, BSD licence), written after their C++
// reference (`pdq/cpp/hashing/pdqhashing.cpp`), since no PDQ is kept up as an npm package (#1268).
// It is the hash the reference list is compared by (F4, beslut 9), and the one hash lists from
// others are shared in. Its steps: luminance; a Jarosz filter (two passes of a box filter each way)
// sized to bring the picture down to 64 × 64; a 16 × 16 corner of its DCT, without the DC row and
// column; and one bit per coefficient, set where it is over their median. `quality` is the
// reference's measure of how much the picture has in it, from 0 to 100; under 50 the hash says
// little, and the reference does not match on it.
//
// Transparent pixels are read on white, as a printed card shows them. Arithmetic is in float, as
// the reference's is, so that only bits whose coefficient sits on the median can differ from it.

export const PDQ_ALGORITHM = 'pdq-256'
// What PDQ's authors give as "the same picture": at most this many of the 256 bits differ.
export const PDQ_MATCH_DISTANCE = 31
// Under this quality a hash says too little about the picture to be matched on.
export const PDQ_MIN_QUALITY = 50

const f = Math.fround
const DCT_SIZE = 16
const BUFFER = 64

// The DCT matrix, 16 rows of 64: the reference skips the first (DC) row.
const DCT: Float32Array = (() => {
  const m = new Float32Array(DCT_SIZE * BUFFER)
  const scale = f(Math.sqrt(2 / BUFFER))
  for (let i = 0; i < DCT_SIZE; i++) for (let j = 0; j < BUFFER; j++) m[i * BUFFER + j] = f(scale * f(Math.cos((Math.PI / 2 / BUFFER) * (i + 1) * (2 * j + 1))))
  return m
})()

function luminance({ width, height, data }: Pixels): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0, p = 0; p < out.length; i += 4, p++) {
    const a = (data[i + 3] ?? 0) / 255
    const r = (data[i] ?? 0) * a + 255 * (1 - a)
    const g = (data[i + 1] ?? 0) * a + 255 * (1 - a)
    const b = (data[i + 2] ?? 0) * a + 255 * (1 - a)
    out[p] = f(f(f(0.299 * r) + f(0.587 * g)) + f(0.114 * b))
  }
  return out
}

const windowSize = (oldDimension: number, newDimension: number) => Math.floor((oldDimension + 2 * newDimension - 1) / (2 * newDimension))

// The reference's `box1DFloat`: a running mean over `window` samples, narrower at both ends.
function box1D(input: Float32Array, output: Float32Array, start: number, length: number, stride: number, window: number): void {
  const half = Math.floor((window + 2) / 2)
  const phase1 = half - 1
  const phase2 = window - half + 1
  const phase3 = length - window
  const phase4 = half - 1
  let li = start
  let ri = start
  let oi = start
  let sum = 0
  let current = 0
  for (let i = 0; i < phase1; i++) {
    sum = f(sum + (input[ri] ?? 0))
    current++
    ri += stride
  }
  for (let i = 0; i < phase2; i++) {
    sum = f(sum + (input[ri] ?? 0))
    current++
    output[oi] = f(sum / current)
    ri += stride
    oi += stride
  }
  for (let i = 0; i < phase3; i++) {
    sum = f(sum + (input[ri] ?? 0))
    sum = f(sum - (input[li] ?? 0))
    output[oi] = f(sum / current)
    li += stride
    ri += stride
    oi += stride
  }
  for (let i = 0; i < phase4; i++) {
    sum = f(sum - (input[li] ?? 0))
    current--
    output[oi] = f(sum / current)
    li += stride
    oi += stride
  }
}

function jarosz(buffer: Float32Array, rows: number, cols: number): void {
  const alongRows = windowSize(cols, BUFFER)
  const alongCols = windowSize(rows, BUFFER)
  const temp = new Float32Array(buffer.length)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < rows; i++) box1D(buffer, temp, i * cols, cols, 1, alongRows)
    for (let j = 0; j < cols; j++) box1D(temp, buffer, j, rows, cols, alongCols)
  }
}

function decimate(buffer: Float32Array, rows: number, cols: number): Float32Array {
  const out = new Float32Array(BUFFER * BUFFER)
  for (let i = 0; i < BUFFER; i++) {
    const ini = Math.floor(((i + 0.5) * rows) / BUFFER)
    for (let j = 0; j < BUFFER; j++) {
      const inj = Math.floor(((j + 0.5) * cols) / BUFFER)
      out[i * BUFFER + j] = buffer[ini * cols + inj] ?? 0
    }
  }
  return out
}

// The reference's gradient sum over the 64 × 64 picture, in whole percent steps.
function qualityOf(b: Float32Array): number {
  let sum = 0
  for (let i = 0; i < BUFFER - 1; i++)
    for (let j = 0; j < BUFFER; j++) sum += Math.abs(Math.trunc(f(f(f((b[i * BUFFER + j] ?? 0) - (b[(i + 1) * BUFFER + j] ?? 0)) * 100) / 255)))
  for (let i = 0; i < BUFFER; i++)
    for (let j = 0; j < BUFFER - 1; j++) sum += Math.abs(Math.trunc(f(f(f((b[i * BUFFER + j] ?? 0) - (b[i * BUFFER + j + 1] ?? 0)) * 100) / 255)))
  return Math.min(100, Math.floor(sum / 90))
}

// D · B · Dᵀ: the 16 × 16 coefficients, row by row.
function dct(b: Float32Array): Float32Array {
  const half = new Float32Array(DCT_SIZE * BUFFER)
  for (let i = 0; i < DCT_SIZE; i++)
    for (let j = 0; j < BUFFER; j++) {
      let sum = 0
      for (let k = 0; k < BUFFER; k++) sum = f(sum + f((DCT[i * BUFFER + k] ?? 0) * (b[k * BUFFER + j] ?? 0)))
      half[i * BUFFER + j] = sum
    }
  const out = new Float32Array(DCT_SIZE * DCT_SIZE)
  for (let i = 0; i < DCT_SIZE; i++)
    for (let j = 0; j < DCT_SIZE; j++) {
      let sum = 0
      for (let k = 0; k < BUFFER; k++) sum = f(sum + f((half[i * BUFFER + k] ?? 0) * (DCT[j * BUFFER + k] ?? 0)))
      out[i * DCT_SIZE + j] = sum
    }
  return out
}

// Bit k of the reference's hash is coefficient k (row by row) over the median, and the hash is
// written with bit 255 first: the same 64 hex digits as Meta's tools print.
function bitsOf(coefficients: Float32Array): string {
  const sorted = Float32Array.from(coefficients).sort()
  // The reference's Torben median of 256 values is the lower middle one.
  const median = sorted[(sorted.length - 1) >> 1] ?? 0
  let hex = ''
  for (let nibble = 0; nibble < 64; nibble++) {
    let v = 0
    for (let b = 0; b < 4; b++) {
      const k = 255 - (nibble * 4 + b)
      v = (v << 1) | ((coefficients[k] ?? 0) > median ? 1 : 0)
    }
    hex += v.toString(16)
  }
  return hex
}

export function pdq(pixels: Pixels): { hash: PerceptualHash; quality: number } {
  const { width, height } = checkPixels(pixels)
  const buffer = luminance(pixels)
  jarosz(buffer, height, width)
  const small = decimate(buffer, height, width)
  return { hash: { algorithm: PDQ_ALGORITHM, bits: bitsOf(dct(small)) }, quality: qualityOf(small) }
}

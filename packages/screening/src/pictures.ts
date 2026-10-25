import type { Pixels } from './schema.js'

// What a model is shown of a picture (#1273): the worker's RGBA pixels on white, as a printed card
// shows them, scaled and cut to the square the model was trained on, channel by channel.

// RGB from 0 to 1, pixel by pixel, with transparency read on white.
export function onWhite({ width, height, data }: Pixels): Float32Array {
  const out = new Float32Array(width * height * 3)
  for (let i = 0, j = 0; j < out.length; i += 4, j += 3) {
    const a = (data[i + 3] ?? 0) / 255
    for (let c = 0; c < 3; c++) out[j + c] = ((data[i + c] ?? 0) * a + 255 * (1 - a)) / 255
  }
  return out
}

// One axis of a separable resampling with a triangle kernel, widened by the scale when the picture
// shrinks so that every source pixel is counted (an antialiased bilinear, as Pillow's is).
function resampleAxis(input: Float32Array, width: number, height: number, to: number, horizontal: boolean): Float32Array {
  const from = horizontal ? width : height
  const across = horizontal ? height : width
  const outWidth = horizontal ? to : width
  const out = new Float32Array((horizontal ? to * height : width * to) * 3)
  const scale = from / to
  const support = Math.max(1, scale)
  for (let o = 0; o < to; o++) {
    const centre = (o + 0.5) * scale
    const lo = Math.max(0, Math.floor(centre - support))
    const hi = Math.min(from - 1, Math.ceil(centre + support))
    const weights: number[] = []
    let total = 0
    for (let k = lo; k <= hi; k++) {
      const w = Math.max(0, 1 - Math.abs((k + 0.5 - centre) / support))
      weights.push(w)
      total += w
    }
    for (let t = 0; t < across; t++)
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let k = lo; k <= hi; k++) sum += (input[(horizontal ? t * width + k : k * width + t) * 3 + c] ?? 0) * (weights[k - lo] ?? 0)
        out[(horizontal ? t * outWidth + o : o * outWidth + t) * 3 + c] = sum / total
      }
  }
  return out
}

// The picture at `toWidth` × `toHeight`, its shape not kept.
export function resample(rgb: Float32Array, width: number, height: number, toWidth: number, toHeight: number): Float32Array {
  if (width === toWidth && height === toHeight) return rgb
  return resampleAxis(resampleAxis(rgb, width, height, toWidth, true), toWidth, height, toHeight, false)
}

function crop(rgb: Float32Array, width: number, x: number, y: number, side: number): Float32Array {
  const out = new Float32Array(side * side * 3)
  for (let r = 0; r < side; r++) out.set(rgb.subarray(((y + r) * width + x) * 3, ((y + r) * width + x + side) * 3), r * side * 3)
  return out
}

// A card's art is seldom square, and a model's one square crop of it would leave out its ends. The
// picture is scaled until its short side is `side`, and seen as one to three squares along its long
// side, the first at one end and the last at the other; a picture within a fifth of square is seen
// as its middle square, as the model was trained.
export function squareTiles(rgb: Float32Array, width: number, height: number, side: number): Float32Array[] {
  const scale = side / Math.min(width, height)
  const w = Math.max(side, Math.round(width * scale))
  const h = Math.max(side, Math.round(height * scale))
  const scaled = resample(rgb, width, height, w, h)
  const long = Math.max(w, h)
  const n = long <= side * 1.2 ? 1 : Math.min(3, Math.ceil(long / side))
  const tiles: Float32Array[] = []
  for (let i = 0; i < n; i++) {
    const offset = n === 1 ? Math.floor((long - side) / 2) : Math.round(((long - side) * i) / (n - 1))
    tiles.push(w >= h ? crop(scaled, w, offset, 0, side) : crop(scaled, w, 0, offset, side))
  }
  return tiles
}

// Channel after channel, each with the mean and spread the model was trained with taken out.
export function planar(rgb: Float32Array, pixels: number, mean: readonly number[], std: readonly number[]): Float32Array {
  const out = new Float32Array(pixels * 3)
  for (let i = 0; i < pixels; i++) for (let c = 0; c < 3; c++) out[c * pixels + i] = ((rgb[i * 3 + c] ?? 0) - (mean[c] ?? 0)) / (std[c] ?? 1)
  return out
}

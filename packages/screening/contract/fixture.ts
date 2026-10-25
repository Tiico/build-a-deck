import type { Pixels } from '../src/index.js'

// Pictures for the contract suite, made of pixels rather than files: a classifier is shown pixels
// (`Pixels`), and the suite asks only what every classifier must answer for any picture.

export function picture(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = paint(x / width, y / height)
      data.set([r, g, b, a], (y * width + x) * 4)
    }
  return { width, height, data }
}

// A picture with something in it at every scale a hash looks at: a diagonal light, a dark disc
// off the centre and a bright band, each larger than a 512-px picture's 1/16.
export const scene = (width: number, height: number): Pixels =>
  picture(width, height, (u, v) => {
    const disc = (u - 0.35) ** 2 + (v - 0.6) ** 2 < 0.04
    const band = v > 0.12 && v < 0.24
    const light = Math.round(255 * (0.15 + 0.7 * ((u + v) / 2)))
    if (disc) return [30, 40, 120, 255]
    if (band) return [240, 220, 90, 255]
    return [light, Math.round(light * 0.9), Math.round(light * 0.7), 255]
  })

// The same scene with every colour turned over: as unlike it as a picture can be.
export const negative = (p: Pixels): Pixels => {
  const data = new Uint8ClampedArray(p.data)
  for (let i = 0; i < data.length; i += 4) data.set([255 - (data[i] ?? 0), 255 - (data[i + 1] ?? 0), 255 - (data[i + 2] ?? 0)], i)
  return { ...p, data }
}

// The picture at a whole fraction of its size, each pixel the mean of the block it stands for:
// what a smaller upload of the same image is.
export function shrink(p: Pixels, factor: number): Pixels {
  const width = Math.floor(p.width / factor)
  const height = Math.floor(p.height / factor)
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 4; c++) {
        let sum = 0
        for (let dy = 0; dy < factor; dy++) for (let dx = 0; dx < factor; dx++) sum += (p.data[((y * factor + dy) * p.width + x * factor + dx) * 4 + c] ?? 0)
        data[(y * width + x) * 4 + c] = Math.round(sum / factor ** 2)
      }
  return { width, height, data }
}

// Every shape a picture can arrive in: the largest the worker draws, square and not, a picture
// smaller than any hash grid, a single pixel, and one fully transparent.
export const SHAPES: { name: string; pixels: Pixels }[] = [
  { name: '512 × 512', pixels: scene(512, 512) },
  { name: '512 × 128', pixels: scene(512, 128) },
  { name: '96 × 512', pixels: scene(96, 512) },
  { name: '5 × 3', pixels: scene(5, 3) },
  { name: '1 × 1', pixels: picture(1, 1, () => [200, 10, 10, 255]) },
  { name: 'genomskinlig', pixels: picture(64, 64, () => [0, 0, 0, 0]) },
]

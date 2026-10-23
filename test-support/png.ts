import { inflateSync } from 'node:zlib'

// A screenshot's pixels, so a test can say what colour the press actually laid down rather than
// what the stylesheet asked for. Chromium writes 8-bit truecolour, with or without an alpha
// channel and never interlaced, which is the whole of what this reads: a fuller decoder would be
// a second thing to trust, and the point here is to trust the pixels. Shared by the packages that
// render (the renderer's own tests, and the server's print files, #1207).

export type Rgb = { r: number; g: number; b: number }
export type Picture = { width: number; height: number; at(x: number, y: number): Rgb }

// PNG dimensions from the IHDR chunk.
export function pngSize(png: Uint8Array): { w: number; h: number } {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  return { w: dv.getUint32(16), h: dv.getUint32(20) }
}

// The whole picture unfiltered once, for a test that reads many pixels of it: where an edge falls
// is a scan along a row, and inflating the file again for every pixel of the scan would be slow.
export function decodePng(png: Uint8Array): Picture {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const width = dv.getUint32(16)
  const depth = png[24]
  const colour = png[25]
  if (depth !== 8 || (colour !== 2 && colour !== 6)) throw new Error(`unexpected PNG: depth ${depth}, colour type ${colour}`)
  const channels = colour === 6 ? 4 : 3
  const raw = inflateSync(Buffer.from(concatIdat(png)))
  const stride = width * channels + 1
  // Undoing the per-scanline filters needs every line above the one asked for, so the picture is
  // unfiltered from the top down into a single buffer and the pixel read out of that.
  const out = new Uint8Array(width * channels * (raw.length / stride))
  for (let row = 0; row * stride < raw.length; row++) {
    const filter = raw[row * stride]
    for (let i = 0; i < width * channels; i++) {
      const cur = raw[row * stride + 1 + i] ?? 0
      const a = i >= channels ? (out[row * width * channels + i - channels] ?? 0) : 0
      const b = row > 0 ? (out[(row - 1) * width * channels + i] ?? 0) : 0
      const c = row > 0 && i >= channels ? (out[(row - 1) * width * channels + i - channels] ?? 0) : 0
      out[row * width * channels + i] = (cur + unfilter(filter ?? 0, a, b, c)) & 255
    }
  }
  return {
    width,
    height: dv.getUint32(20),
    at(x, y) {
      const at = y * width * channels + x * channels
      return { r: out[at] ?? 0, g: out[at + 1] ?? 0, b: out[at + 2] ?? 0 }
    },
  }
}

export function pngPixel(png: Uint8Array, x: number, y: number): Rgb {
  return decodePng(png).at(x, y)
}

function unfilter(filter: number, a: number, b: number, c: number): number {
  switch (filter) {
    case 0:
      return 0
    case 1:
      return a
    case 2:
      return b
    case 3:
      return (a + b) >> 1
    case 4: {
      const p = a + b - c
      const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    default:
      throw new Error(`unknown PNG filter ${filter}`)
  }
}

// A PNG may split its pixels over several IDAT chunks; the stream is the chunks joined.
function concatIdat(png: Uint8Array): Uint8Array {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const parts: Uint8Array[] = []
  for (let at = 8; at + 8 <= png.length; ) {
    const length = dv.getUint32(at)
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8))
    if (type === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + length))
    if (type === 'IEND') break
    at += 12 + length
  }
  const total = parts.reduce((n, part) => n + part.length, 0)
  const all = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    all.set(part, at)
    at += part.length
  }
  return all
}
